import type { MultibandEqParameters } from "../dsp/biquad-eq-multiband.ts";
import { createPitchShifterNode } from "../dsp/pitch-shifter-node.ts";
import { disposeWorklet } from "../dsp/worklet-disposal.ts";
import {
  AudioBufferPlayback,
  DECLICK_SECONDS,
} from "./audio-buffer-playback.ts";
import { AudioChannel } from "./audio-channel.ts";
import type { AudioPlaybackSource } from "./audio-sources.ts";
import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

type ClipPlayback = {
  clipId: string;
  playback: AudioBufferPlayback;
};

/** Owns region playback and a channel that also accepts independently routed input for capture monitoring. */
export class AudioTrackPlayback {
  private readonly transport: AudioContextTransport;
  private playbacks: ClipPlayback[] = [];
  private readonly pitchShiftBus: PitchShiftBus;
  /** Mutes region playback without muting other sources connected to channel.input. */
  private readonly playbackGain: GainNode;
  readonly channel: AudioChannel;

  constructor({
    transport,
    output,
    eq,
    gain,
  }: {
    transport: AudioContextTransport;
    output: AudioNode;
    eq: MultibandEqParameters;
    gain: number;
  }) {
    this.transport = transport;
    this.channel = new AudioChannel({
      context: transport.context,
      output,
      eq,
      gain,
    });
    this.playbackGain = transport.context.createGain();
    this.playbackGain.connect(this.channel.input);
    this.pitchShiftBus = new PitchShiftBus({
      transport,
      output: this.playbackGain,
    });
  }

  setSources(sources: readonly AudioPlaybackSource[]): void {
    for (const { playback } of this.playbacks) {
      playback.dispose();
    }
    this.playbacks = sources.map((source) => {
      const playback = new AudioBufferPlayback({
        transport: this.transport,
        output: this.pitchShiftBus.input,
      });
      playback.setSource(source);
      return { clipId: source.clipId, playback };
    });
  }

  setClipGain({ clipId, gain }: { clipId: string; gain: number }): void {
    for (const entry of this.playbacks) {
      if (entry.clipId === clipId) {
        entry.playback.setGain(gain);
      }
    }
  }

  setPlaybackGain(gain: number): void {
    this.playbackGain.gain.setValueAtTime(
      gain,
      this.transport.context.currentTime,
    );
  }

  dispose(): void {
    this.setSources([]);
    this.pitchShiftBus.dispose();
    this.playbackGain.disconnect();
    this.channel.dispose();
  }
}

/**
 * Delay before tearing down a stopped run. Covers the source declick fade plus
 * pitch shifter latency (about 40 ms), so the faded tail drains to the output.
 */
const RUN_TEARDOWN_SECONDS = 0.1;

type PitchShiftRun = {
  /** Closes this run's input once stopped sources finish their fade. */
  gate: GainNode;
  pitchShifter?: AudioWorkletNode;
};

/** Sums playback sources before pitch correction for one transport run. */
class PitchShiftBus implements TransportParticipant {
  readonly input: GainNode;
  private readonly transport: AudioContextTransport;
  private readonly output: AudioNode;
  private readonly unregister: () => void;
  private run?: PitchShiftRun;

  constructor({
    transport,
    output,
  }: {
    transport: AudioContextTransport;
    output: AudioNode;
  }) {
    this.transport = transport;
    this.output = output;
    this.input = transport.context.createGain();
    this.unregister = transport.register(this);
  }

  start(): void {
    const context = this.transport.context;
    const playbackRate = this.transport.playbackRate;
    const gate = context.createGain();
    this.input.connect(gate);
    if (playbackRate === 1) {
      gate.connect(this.output);
      this.run = { gate };
      return;
    }
    const pitchShifter = createPitchShifterNode({
      context,
      channelCount: 2,
      pitchRatio: 1 / playbackRate,
    });
    gate.connect(pitchShifter).connect(this.output);
    this.run = { gate, pitchShifter };
  }

  /**
   * Lets stopped sources fade out through this run, then closes it. The next
   * run starts after the transport's scheduling lead, so it never overlaps the
   * closing gate.
   */
  stop(): void {
    const run = this.run;
    if (!run) {
      return;
    }
    this.run = undefined;
    const context = this.transport.context;
    run.gate.gain.setValueAtTime(0, context.currentTime + DECLICK_SECONDS);
    setTimeout(() => {
      this.input.disconnect(run.gate);
      run.gate.disconnect();
      if (run.pitchShifter) {
        disposeWorklet(run.pitchShifter);
      }
    }, RUN_TEARDOWN_SECONDS * 1000);
  }

  dispose(): void {
    this.unregister();
  }
}
