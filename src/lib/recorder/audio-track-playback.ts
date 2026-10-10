import type { MultibandEqParameters } from "../dsp/biquad-eq-multiband.ts";
import { createPitchShifterNode } from "../dsp/pitch-shifter-node.ts";
import { disposeWorklet } from "../dsp/worklet-disposal.ts";
import { AudioBufferPlayback } from "./audio-buffer-playback.ts";
import { AudioChannel } from "./audio-channel.ts";
import type { AudioPlaybackSource } from "./audio-sources.ts";
import type { AudioContextTransport } from "./transport.ts";

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

  /** Rewires pitch correction for the transport's new playback rate. */
  updatePlaybackRate(): void {
    this.pitchShiftBus.reconnect();
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
 * Sums playback sources before pitch correction for the transport's playback
 * rate. It stays connected across pause and seek, and only a playback rate
 * change rewires it.
 */
class PitchShiftBus {
  readonly input: GainNode;
  private readonly transport: AudioContextTransport;
  private readonly output: AudioNode;
  private pitchShifter?: AudioWorkletNode;

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
    this.connect();
  }

  reconnect(): void {
    this.disconnect();
    this.connect();
  }

  private connect(): void {
    const playbackRate = this.transport.playbackRate;
    if (playbackRate === 1) {
      this.input.connect(this.output);
      return;
    }
    this.pitchShifter = createPitchShifterNode({
      context: this.transport.context,
      channelCount: 2,
      pitchRatio: 1 / playbackRate,
    });
    this.input.connect(this.pitchShifter).connect(this.output);
  }

  private disconnect(): void {
    this.input.disconnect();
    if (this.pitchShifter) {
      disposeWorklet(this.pitchShifter);
    }
    this.pitchShifter = undefined;
  }

  dispose(): void {
    this.disconnect();
  }
}
