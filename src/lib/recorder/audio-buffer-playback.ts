export class AudioBufferPlayback {
  private readonly context: AudioContext;
  private readonly gain: GainNode;
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;
  private timelineOffset = 0;

  constructor({
    context,
    output,
  }: {
    context: AudioContext;
    output: AudioNode;
  }) {
    this.context = context;
    this.gain = context.createGain();
    this.gain.connect(output);
  }

  setBuffer(buffer?: AudioBuffer): void {
    this.buffer = buffer;
  }

  getBuffer(): AudioBuffer | undefined {
    return this.buffer;
  }

  setGain(gain: number): void {
    this.gain.gain.setTargetAtTime(gain, this.context.currentTime, 0.01);
  }

  setTimelineOffset(offset: number): void {
    this.timelineOffset = offset;
  }

  /**
   * Starts this buffer as part of a transport scheduled for
   * `scheduledContextTime`, when the transport playhead is at `playheadTime`.
   *
   * The buffer's sample zero belongs at its configured offset on the transport
   * timeline. If that point has passed, playback seeks into the buffer. If it is
   * ahead, playback delays the buffer start.
   */
  start({
    scheduledContextTime,
    playheadTime,
  }: {
    scheduledContextTime: number;
    playheadTime: number;
  }): void {
    const buffer = this.buffer;
    if (!buffer) {
      return;
    }
    const bufferOffset = Math.max(0, playheadTime - this.timelineOffset);
    if (bufferOffset >= buffer.duration) {
      return;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    source.start(
      scheduledContextTime + Math.max(0, this.timelineOffset - playheadTime),
      bufferOffset,
    );
    this.source = source;
  }

  stop(): void {
    this.source?.stop();
    this.source?.disconnect();
    this.source = undefined;
  }
}
