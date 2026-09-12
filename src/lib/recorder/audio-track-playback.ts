import type { EqParameters } from "../dsp/biquad-eq.ts";
import { createPitchShifterNode } from "../dsp/pitch-shifter-node.ts";
import {
  AudioBufferPlayback,
  type AudioPlaybackSource,
} from "./audio-buffer-playback.ts";
import { AudioChannel } from "./audio-channel.ts";
import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

/** Owns region playback and a channel that also accepts independently routed input for capture monitoring. */
export class AudioTrackPlayback {
  private readonly transport: AudioContextTransport;
  private playbacks: AudioBufferPlayback[] = [];
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
    eq: EqParameters;
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
    for (const playback of this.playbacks) {
      playback.dispose();
    }
    this.playbacks = sources.map((source) => {
      const playback = new AudioBufferPlayback({
        transport: this.transport,
        output: this.pitchShiftBus.input,
      });
      playback.setSource(source);
      return playback;
    });
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

/** Sums playback sources before pitch correction for one transport run. */
class PitchShiftBus implements TransportParticipant {
  readonly input: GainNode;
  private readonly transport: AudioContextTransport;
  private readonly output: AudioNode;
  private readonly unregister: () => void;
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
    this.unregister = transport.register(this);
  }

  start(): void {
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

  stop(): void {
    this.input.disconnect();
    this.pitchShifter?.disconnect();
    this.pitchShifter = undefined;
  }

  dispose(): void {
    this.unregister();
  }
}
