export class AudioBufferPlayback {
  private readonly context: AudioContext;
  private readonly gain: GainNode;
  private buffer?: AudioBuffer;
  private source?: AudioBufferSourceNode;

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
    this.stop();
    this.buffer = buffer;
  }

  setGain(gain: number): void {
    this.gain.gain.setTargetAtTime(gain, this.context.currentTime, 0.01);
  }

  /**
   * Starts this buffer as part of a transport scheduled for
   * `scheduledContextTime`, when the transport playhead is at `playheadTime`.
   *
   * The buffer's sample zero belongs at `bufferTimelineOffset` on the transport
   * timeline. If that point has passed, playback seeks into the buffer. If it is
   * ahead, playback delays the buffer start.
   *
   * `scheduledContextTime` is the shared future start for all playback nodes,
   * not the current AudioContext time.
   */
  start({
    scheduledContextTime,
    playheadTime,
    bufferTimelineOffset,
  }: {
    scheduledContextTime: number;
    playheadTime: number;
    bufferTimelineOffset: number;
  }): void {
    this.stop();
    const buffer = this.buffer;
    if (!buffer) {
      return;
    }
    const bufferOffset = Math.max(0, playheadTime - bufferTimelineOffset);
    if (bufferOffset >= buffer.duration) {
      return;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    source.start(
      scheduledContextTime + Math.max(0, bufferTimelineOffset - playheadTime),
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
