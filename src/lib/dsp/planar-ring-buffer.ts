/** Absolute-frame-addressed planar PCM ring with contiguous mirrored reads. */
export class PlanarRingBuffer {
  readonly channelData: Float32Array[];
  readonly capacityFrames: number;
  startFrame = 0;
  endFrame = 0;

  constructor({
    channelCount,
    capacityFrames,
  }: {
    channelCount: number;
    capacityFrames: number;
  }) {
    this.capacityFrames = capacityFrames;
    this.channelData = Array.from(
      { length: channelCount },
      () => new Float32Array(2 * capacityFrames),
    );
  }

  get length(): number {
    return this.endFrame - this.startFrame;
  }

  get writableFrames(): number {
    return this.capacityFrames - this.length;
  }

  push(input: readonly Float32Array[], frames = input[0]?.length ?? 0): void {
    if (this.writableFrames < frames) {
      throw new Error("Planar ring buffer is full.");
    }
    for (let channel = 0; channel < this.channelData.length; channel++) {
      const source = input[channel];
      const destination = this.channelData[channel];
      for (let frame = 0; frame < frames; frame++) {
        const index = (this.endFrame + frame) % this.capacityFrames;
        const value = source[frame];
        destination[index] = value;
        destination[index + this.capacityFrames] = value;
      }
    }
    this.endFrame += frames;
  }

  pushZeros(frames: number): void {
    if (this.writableFrames < frames) {
      throw new Error("Planar ring buffer is full.");
    }
    for (let channel = 0; channel < this.channelData.length; channel++) {
      const destination = this.channelData[channel];
      for (let frame = 0; frame < frames; frame++) {
        const index = (this.endFrame + frame) % this.capacityFrames;
        destination[index] = 0;
        destination[index + this.capacityFrames] = 0;
      }
    }
    this.endFrame += frames;
  }

  read(channel: number, frame: number): number {
    if (frame < this.startFrame || this.endFrame <= frame) {
      return 0;
    }
    return this.channelData[channel][frame % this.capacityFrames];
  }

  /** Return the physical start of a retained range in mirrored channelData. */
  getContiguousOffset(frame: number, frames: number): number {
    if (
      frame < this.startFrame ||
      this.endFrame < frame + frames ||
      this.capacityFrames < frames
    ) {
      throw new Error(
        "Requested PCM range is not retained in the ring buffer.",
      );
    }
    return frame % this.capacityFrames;
  }

  discardBefore(frame: number): void {
    this.startFrame = Math.min(this.endFrame, Math.max(this.startFrame, frame));
  }
}
