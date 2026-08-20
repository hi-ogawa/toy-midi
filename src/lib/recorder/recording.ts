import type { CaptureChunk } from "./capture-worklet.ts";

export class ActiveRecording {
  readonly #chunks: CaptureChunk[] = [];
  readonly #startFrame: number;
  readonly #capacityFrames: number;

  constructor(startFrame: number, capacityFrames: number) {
    this.#startFrame = startFrame;
    this.#capacityFrames = capacityFrames;
  }

  append(chunk: CaptureChunk): void {
    this.#chunks.push(chunk);
  }

  isFull(): boolean {
    const last = this.#chunks.at(-1);
    return (
      last !== undefined &&
      last.frameStart + last.samples.length - this.#startFrame >=
        this.#capacityFrames
    );
  }

  finish(stopFrame: number): Float32Array | undefined {
    const length = Math.min(stopFrame - this.#startFrame, this.#capacityFrames);
    if (length <= 0) {
      return undefined;
    }
    const samples = new Float32Array(length);
    for (const chunk of this.#chunks) {
      setArrayClipped(
        samples,
        chunk.samples,
        chunk.frameStart - this.#startFrame,
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
