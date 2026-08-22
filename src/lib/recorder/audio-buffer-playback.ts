import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

export class AudioBufferPlayback implements TransportParticipant {
  private readonly context: AudioContext;
  private readonly gain: GainNode;
  private readonly unregister: () => void;
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  private timelineOffset = 0;

  constructor({
    transport,
    output,
  }: {
    transport: AudioContextTransport;
    output: AudioNode;
  }) {
    this.context = transport.context;
    this.gain = this.context.createGain();
    this.gain.connect(output);
    this.unregister = transport.register(this);
  }

  setBuffer(buffer?: AudioBuffer): void {
    this.buffer = buffer;
  }

  setGain(gain: number): void {
    this.gain.gain.setTargetAtTime(gain, this.context.currentTime, 0.01);
  }

  setTimelineOffset(offset: number): void {
    this.timelineOffset = offset;
  }

  /**
   * Starts this buffer from the transport's shared context and timeline anchor.
   *
   * The buffer's sample zero belongs at its configured offset on the transport
   * timeline. If that point has passed, playback seeks into the buffer. If it is
   * ahead, playback delays the buffer start.
   */
  start(transport: AudioContextTransport): void {
    const buffer = this.buffer;
    if (!buffer) {
      return;
    }
    const bufferOffset = Math.max(
      0,
      transport.timelineTime - this.timelineOffset,
    );
    if (bufferOffset >= buffer.duration) {
      return;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    source.start(
      transport.contextTime! +
        Math.max(0, this.timelineOffset - transport.timelineTime),
      bufferOffset,
    );
    this.source = source;
  }

  stop(): void {
    this.source?.stop();
    this.source?.disconnect();
    this.source = undefined;
  }

  dispose(): void {
    this.unregister();
    this.gain.disconnect();
  }
}
