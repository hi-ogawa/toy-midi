import type { CaptureChunk } from "./capture-worklet.ts";

export class CapturedAudio {
  readonly chunks: CaptureChunk[];
  readonly startFrame: number;
  readonly stopFrame: number;

  constructor({
    chunks,
    startFrame,
    stopFrame,
  }: {
    chunks: CaptureChunk[];
    startFrame: number;
    stopFrame: number;
  }) {
    this.chunks = chunks;
    this.startFrame = startFrame;
    this.stopFrame = stopFrame;
  }

  getSamples({
    startFrame,
    endFrame,
  }: {
    startFrame: number;
    endFrame: number;
  }): Float32Array {
    const samples = new Float32Array(Math.max(0, endFrame - startFrame));
    // Preserve gaps as silence and let later chunks replace overlaps.
    for (const chunk of this.chunks) {
      const offset = chunk.frameStart - startFrame;
      const sourceStart = Math.max(0, -offset);
      const targetStart = Math.max(0, offset);
      const length = Math.min(
        chunk.samples.length - sourceStart,
        samples.length - targetStart,
      );
      if (length > 0) {
        samples.set(
          chunk.samples.subarray(sourceStart, sourceStart + length),
          targetStart,
        );
      }
    }
    return samples;
  }
}
