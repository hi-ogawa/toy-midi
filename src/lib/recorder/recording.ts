import type { CaptureChunk } from "./capture-worklet.ts";

export class ActiveRecording {
  private readonly chunks: CaptureChunk[] = [];
  private readonly startFrame: number;
  private readonly capacityFrames: number;
  private endFrame: number;

  constructor(startFrame: number, capacityFrames: number) {
    this.startFrame = startFrame;
    this.capacityFrames = capacityFrames;
    this.endFrame = startFrame;
  }

  append(chunk: CaptureChunk): void {
    this.chunks.push(chunk);
    this.endFrame = Math.max(
      this.endFrame,
      chunk.frameStart + chunk.samples.length,
    );
  }

  getDurationFrames(): number {
    // This is elapsed capture span, not accumulated PCM count. Missing frames
    // become silence during assembly and still contribute to take duration.
    return this.endFrame - this.startFrame;
  }

  isFull(): boolean {
    // Capacity is elapsed AudioContext frames, including capture gaps, rather
    // than only the number of PCM samples delivered.
    return this.getDurationFrames() >= this.capacityFrames;
  }

  finish(stopFrame: number): Float32Array | undefined {
    // Reconstruct [startFrame, stopFrame) in capture-relative coordinates.
    // Missing ranges remain zero-filled and later chunks replace overlaps.
    const length = Math.min(stopFrame - this.startFrame, this.capacityFrames);
    if (length <= 0) {
      return undefined;
    }
    const samples = new Float32Array(length);
    for (const chunk of this.chunks) {
      setArrayClipped(
        samples,
        chunk.samples,
        chunk.frameStart - this.startFrame,
      );
    }
    return samples;
  }
}

/** Performs `target.set(source, offset)` while clipping either array boundary. */
function setArrayClipped(
  target: Float32Array,
  source: Float32Array,
  offset: number,
): void {
  const sourceStart = Math.max(0, -offset);
  const targetStart = Math.max(0, offset);
  const length = Math.min(
    source.length - sourceStart,
    target.length - targetStart,
  );
  if (length > 0) {
    target.set(source.subarray(sourceStart, sourceStart + length), targetStart);
  }
}
