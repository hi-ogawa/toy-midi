import { PitchShifterNode } from "../dsp/pitch-shifter-node.ts";
import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

/** Sums playback sources before pitch correction for one transport run. */
export class PlaybackBus implements TransportParticipant {
  readonly input: PitchShifterNode;
  private readonly transport: AudioContextTransport;
  private readonly unregister: () => void;

  constructor({
    transport,
    output,
  }: {
    transport: AudioContextTransport;
    output: AudioNode;
  }) {
    this.transport = transport;
    this.input = new PitchShifterNode({
      context: transport.context,
      channelCount: 2,
      pitchRatio: 1,
    });
    this.input.connect(output);
    this.unregister = transport.register(this);
  }

  start(): void {
    this.input.setPitchRatio(1 / this.transport.playbackRate);
  }

  stop(): void {
    this.input.reset();
  }

  dispose(): void {
    this.unregister();
    this.input.disconnect();
  }
}
