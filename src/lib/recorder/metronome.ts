import type { TimeSignature } from "../../types.ts";
import { midiToHz, parseMidiPitch } from "../music.ts";
import {
  type ContextTimeWindow,
  getPlaybackSegments,
  getSegmentContextTime,
  getSegmentRange,
} from "./playback-segments.ts";
import {
  type AudioContextTransport,
  startLookaheadScheduler,
  type TransportParticipant,
} from "./transport.ts";

export class RecorderMetronome implements TransportParticipant {
  private readonly output: GainNode;
  private disposeScheduling?: () => void;
  private tempo = 60;
  private timeSignature: TimeSignature = { numerator: 4, denominator: 4 };
  private secondsPerClick = 1;

  constructor(
    private readonly transport: AudioContextTransport,
    output: AudioNode,
  ) {
    this.output = transport.context.createGain();
    this.output.gain.value = 0;
    this.output.connect(output);
    transport.register(this);
  }

  setGain(gain: number): void {
    this.output.gain.setValueAtTime(gain, this.transport.context.currentTime);
  }

  setTempo(tempo: number): void {
    this.tempo = tempo;
    this.updateTiming();
  }

  setTimeSignature(timeSignature: TimeSignature): void {
    this.timeSignature = timeSignature;
    this.updateTiming();
  }

  private updateTiming(): void {
    this.secondsPerClick =
      (60 / this.tempo) * (4 / this.timeSignature.denominator);
    if (this.transport.store.get().isPlaying) {
      this.start();
    }
  }

  start(): void {
    this.stop();
    const context = this.transport.context;
    // Tempo changes restart mid-run, so resume from now rather than the run start.
    this.disposeScheduling = startLookaheadScheduler({
      context,
      from: Math.max(
        this.transport.playbackRun!.contextTime,
        context.currentTime,
      ),
      schedule: (window) => this.schedule(window),
    });
  }

  stop(): void {
    this.disposeScheduling?.();
    this.disposeScheduling = undefined;
  }

  /** Queues the clicks of every loop pass that sounds during the window. */
  private schedule(window: ContextTimeWindow): void {
    const playbackRun = this.transport.playbackRun!;
    const currentTime = this.transport.context.currentTime;
    for (const segment of getPlaybackSegments(playbackRun, window)) {
      const range = getSegmentRange(segment, window);
      for (
        let index = Math.ceil(range.start / this.secondsPerClick);
        index * this.secondsPerClick < range.end;
        index++
      ) {
        const contextTime = getSegmentContextTime(
          segment,
          index * this.secondsPerClick,
        );
        // A stalled timer can hand over a window that already began, so skip
        // clicks that have elapsed rather than playing them late.
        if (contextTime < currentTime) {
          continue;
        }
        this.scheduleClick({
          accent: index % this.timeSignature.numerator === 0,
          contextTime,
        });
      }
    }
  }

  private scheduleClick({
    accent,
    contextTime,
  }: {
    accent: boolean;
    contextTime: number;
  }): void {
    scheduleOscillatorClick({
      context: this.transport.context,
      output: this.output,
      contextTime,
      frequency: midiToHz(parseMidiPitch(accent ? "C7" : "G6")),
      gain: 1,
      attack: 0.001,
      decay: 0.03,
    });
  }
}

function scheduleOscillatorClick({
  context,
  output,
  contextTime,
  frequency,
  gain,
  attack,
  decay,
}: {
  context: AudioContext;
  output: AudioNode;
  contextTime: number;
  frequency: number;
  gain: number;
  attack: number;
  decay: number;
}): void {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  const attackEndTime = contextTime + attack;
  const decayEndTime = attackEndTime + decay;
  oscillator.frequency.value = frequency;
  envelope.gain.setValueAtTime(0, contextTime);
  envelope.gain.linearRampToValueAtTime(gain, attackEndTime);
  const decayTimeConstant = Math.log(decay + 1) / Math.log(200);
  envelope.gain.setTargetAtTime(0, attackEndTime, decayTimeConstant);
  envelope.gain.linearRampToValueAtTime(0, decayEndTime);
  oscillator.connect(envelope).connect(output);
  oscillator.start(contextTime);
  oscillator.stop(decayEndTime);
}
