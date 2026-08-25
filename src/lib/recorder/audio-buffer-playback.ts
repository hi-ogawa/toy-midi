import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

export class AudioBufferPlayback implements TransportParticipant {
  private readonly transport: AudioContextTransport;
  private readonly gain: GainNode;
  private readonly unregister: () => void;
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  /** Transport timeline time where this playback region begins. */
  private timelineOffset = 0;
  /** Time within the source buffer where this playback region begins. */
  private sourceOffset = 0;
  /** Length of this playback region in seconds; defaults to the remaining buffer. */
  private duration?: number;

  constructor({
    transport,
    output,
  }: {
    transport: AudioContextTransport;
    output: AudioNode;
  }) {
    this.transport = transport;
    this.gain = transport.context.createGain();
    this.gain.connect(output);
    this.unregister = transport.register(this);
  }

  setBuffer(buffer?: AudioBuffer): void {
    this.buffer = buffer;
  }

  setGain(gain: number): void {
    this.gain.gain.setTargetAtTime(
      gain,
      this.transport.context.currentTime,
      0.01,
    );
  }

  setTimelineOffset(offset: number): void {
    this.timelineOffset = offset;
  }

  setSourceRange({
    sourceOffset,
    duration,
  }: {
    sourceOffset: number;
    duration?: number;
  }): void {
    this.sourceOffset = sourceOffset;
    this.duration = duration;
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
    const elapsed = Math.max(0, playbackAnchor.position - this.timelineOffset);
    const duration = Math.min(
      this.duration ?? buffer.duration - this.sourceOffset,
      buffer.duration - this.sourceOffset,
    );
    if (elapsed >= duration) {
      return;
    }
    const source = this.transport.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    source.start(
      playbackAnchor.contextTime +
        Math.max(0, this.timelineOffset - playbackAnchor.position),
      this.sourceOffset + elapsed,
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
    this.gain.disconnect();
  }
}
