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

  start({
    contextTime,
    timelineTime,
    timelineOffset,
  }: {
    contextTime: number;
    timelineTime: number;
    timelineOffset: number;
  }): void {
    this.stop();
    const buffer = this.buffer;
    if (!buffer) {
      return;
    }
    const bufferOffset = Math.max(0, timelineTime - timelineOffset);
    if (bufferOffset >= buffer.duration) {
      return;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    source.start(
      contextTime + Math.max(0, timelineOffset - timelineTime),
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
