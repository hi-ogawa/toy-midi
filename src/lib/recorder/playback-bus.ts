import { createPitchShifterNode } from "../dsp/pitch-shifter-node.ts";
import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

/** Sums playback sources before pitch correction for one transport run. */
export class PlaybackBus implements TransportParticipant {
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
