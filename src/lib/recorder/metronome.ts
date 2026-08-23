import type { TimeSignature } from "../../types.ts";
import { midiToHz, parseMidiPitch } from "../music.ts";
import { secondsToBeats } from "../timeline.ts";
import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

const SCHEDULE_AHEAD_SECONDS = 0.1;
const SCHEDULER_INTERVAL_MS = 25;

export class RecorderMetronome implements TransportParticipant {
  private readonly output: GainNode;
  private disposeScheduling?: () => void;
  private nextClickIndex = 0;
  private tempo = 120;
  private clickDurationInQuarterNotes = 1;
  private clicksPerAccent = 4;

  constructor(private readonly transport: AudioContextTransport) {
    this.output = transport.context.createGain();
    this.output.gain.value = 0;
    this.output.connect(transport.context.destination);
    transport.register(this);
  }

  setGain(gain: number): void {
    this.output.gain.setValueAtTime(gain, this.transport.context.currentTime);
  }

  setTempo(tempo: number): void {
    this.tempo = tempo;
    if (this.transport.store.get().running) {
      this.start();
    }
  }

  setTimeSignature({ numerator, denominator }: TimeSignature): void {
    this.clickDurationInQuarterNotes = 4 / denominator;
    this.clicksPerAccent = numerator;
    if (this.transport.store.get().running) {
      this.start();
    }
  }

  start(): void {
    this.stop();
    const playbackAnchor = this.transport.playbackAnchor!;
    this.nextClickIndex = Math.ceil(
      secondsToBeats(playbackAnchor.position, this.tempo) /
        this.clickDurationInQuarterNotes -
        1e-9,
    );
    this.schedule();
    this.disposeScheduling = startInterval(
      () => this.schedule(),
      SCHEDULER_INTERVAL_MS,
    );
  }

  stop(): void {
    this.disposeScheduling?.();
    this.disposeScheduling = undefined;
  }

  private schedule(): void {
    const secondsPerClick =
      (60 / this.tempo) * this.clickDurationInQuarterNotes;
    while (true) {
      // Convert this click's timeline position through the transport playback
      // anchor: contextTime = anchor context + click position - anchor position.
      const clickPosition = this.nextClickIndex * secondsPerClick;
      const playbackAnchor = this.transport.playbackAnchor!;
      const contextTime =
        playbackAnchor.contextTime + clickPosition - playbackAnchor.position;
      // Schedule only the near future, then let the interval extend the window.
      if (
        contextTime >
        this.transport.context.currentTime + SCHEDULE_AHEAD_SECONDS
      ) {
        break;
      }
      // Tempo changes restart from the anchor, so skip clicks already elapsed.
      if (contextTime >= this.transport.context.currentTime) {
        this.scheduleClick({
          accent: this.nextClickIndex % this.clicksPerAccent === 0,
          contextTime,
        });
      }
      this.nextClickIndex += 1;
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

function startInterval(callback: () => void, interval: number): () => void {
  const id = setInterval(callback, interval);
  return () => clearInterval(id);
}
