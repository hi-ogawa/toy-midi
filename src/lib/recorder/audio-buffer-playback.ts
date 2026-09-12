import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

/** A buffer slice placed on the timeline, with all times in seconds. */
export interface AudioPlaybackSource {
  buffer: AudioBuffer;
  /** Timeline position where the slice starts. */
  start: number;
  /** Position within the buffer where the slice starts. */
  offset: number;
  duration: number;
}

export class AudioBufferPlayback implements TransportParticipant {
  private readonly transport: AudioContextTransport;
  private readonly output: AudioNode;
  private readonly unregister: () => void;
  private playbackSource?: AudioPlaybackSource;
  private source?: AudioBufferSourceNode;

  constructor({
    transport,
    output,
  }: {
    transport: AudioContextTransport;
    output: AudioNode;
  }) {
    this.transport = transport;
    this.output = output;
    this.unregister = transport.register(this);
  }

  setSource(source: AudioPlaybackSource): void {
    this.playbackSource = source;
  }

  /** Schedules the slice from the transport anchor, seeking or delaying as needed. */
  start(): void {
    const playbackSource = this.playbackSource;
    if (!playbackSource) {
      return;
    }
    const playbackAnchor = this.transport.playbackAnchor!;
    const { buffer, start, offset, duration } = playbackSource;
    const elapsed = Math.max(0, playbackAnchor.position - start);
    if (elapsed >= duration) {
      return;
    }
    const source = this.transport.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.transport.playbackRate;
    source.connect(this.output);
    source.start(
      playbackAnchor.contextTime +
        Math.max(0, start - playbackAnchor.position) /
          this.transport.playbackRate,
      offset + elapsed,
      duration - elapsed,
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
  }
}
