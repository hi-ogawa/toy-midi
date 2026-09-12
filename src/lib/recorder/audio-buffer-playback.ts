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
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  /** Transport timeline time corresponding to source-buffer time zero. */
  private bufferTimelineOffset = 0;
  private timelineRange?: { start: number; end: number };

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

  setBuffer(buffer?: AudioBuffer): void {
    this.buffer = buffer;
  }

  setBufferTimelineOffset(offset: number): void {
    this.bufferTimelineOffset = offset;
  }

  setTimelineRange(range: { start: number; end: number }): void {
    this.timelineRange = range;
  }

  /**
   * Starts this buffer from the transport's shared context and timeline anchor.
   *
   * The buffer's sample zero belongs at its configured offset on the transport
   * timeline. If that point has passed, playback seeks into the buffer. If it is
   * ahead, playback delays the buffer start.
   */
  start(): void {
    const buffer = this.buffer;
    if (!buffer) {
      return;
    }
    const playbackAnchor = this.transport.playbackAnchor!;
    const timelineStart =
      this.timelineRange?.start ?? this.bufferTimelineOffset;
    const timelineEnd =
      this.timelineRange?.end ?? this.bufferTimelineOffset + buffer.duration;
    const elapsed = Math.max(0, playbackAnchor.position - timelineStart);
    const duration = timelineEnd - timelineStart;
    if (elapsed >= duration) {
      return;
    }
    const source = this.transport.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.transport.playbackRate;
    source.connect(this.output);
    source.start(
      playbackAnchor.contextTime +
        Math.max(0, timelineStart - playbackAnchor.position) /
          this.transport.playbackRate,
      timelineStart - this.bufferTimelineOffset + elapsed,
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
