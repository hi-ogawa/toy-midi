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
      context: transport.context,
      output: this.playbackGain,
      playbackRate: transport.playbackRate,
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

  setPlaybackRate(playbackRate: number): void {
    this.pitchShiftBus.setPlaybackRate(playbackRate);
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

/** Keeps the original pitch when playback sources play at a changed speed. */
class PitchShiftBus {
  readonly input: GainNode;
  private readonly context: AudioContext;
  private readonly output: AudioNode;
  /** Present only when the rate is not 1x. */
  private pitchShifter?: AudioWorkletNode;

  constructor({
    context,
    output,
    playbackRate,
  }: {
    context: AudioContext;
    output: AudioNode;
    playbackRate: number;
  }) {
    this.context = context;
    this.output = output;
    this.input = context.createGain();
    this.connectRoute(playbackRate);
  }

  setPlaybackRate(playbackRate: number): void {
    this.disconnectRoute();
    this.connectRoute(playbackRate);
  }

  dispose(): void {
    this.disconnectRoute();
  }

  /** Connects input to output, through a pitch shifter unless the rate is 1x. */
  private connectRoute(playbackRate: number): void {
    if (playbackRate === 1) {
      this.input.connect(this.output);
      return;
    }
    this.pitchShifter = createPitchShifterNode({
      context: this.context,
      channelCount: 2,
      pitchRatio: 1 / playbackRate,
    });
    this.input.connect(this.pitchShifter).connect(this.output);
  }

  private disconnectRoute(): void {
    this.input.disconnect();
    if (this.pitchShifter) {
      disposeWorklet(this.pitchShifter);
    }
    this.pitchShifter = undefined;
  }
}
