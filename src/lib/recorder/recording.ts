import type { CaptureChunk } from "./capture-worklet.ts";

export class ActiveRecording {
  readonly #chunks: CaptureChunk[] = [];
  readonly #capacityFrames: number;

  constructor(capacityFrames: number) {
    this.#capacityFrames = capacityFrames;
  }

  append(chunk: CaptureChunk): void {
    this.#chunks.push(chunk);
  }

  get full(): boolean {
    const first = this.#chunks[0];
    const last = this.#chunks.at(-1);
    return (
      first !== undefined &&
      last !== undefined &&
      last.frameStart + last.samples.length - first.frameStart >=
        this.#capacityFrames
    );
  }

  finish(): { samples: Float32Array; firstFrame: number } | undefined {
    const firstFrame = this.#chunks[0]?.frameStart;
    if (firstFrame === undefined) {
      return undefined;
    }
    const last = this.#chunks.at(-1)!;
    const length = Math.min(
      last.frameStart + last.samples.length - firstFrame,
      this.#capacityFrames,
    );
    const samples = new Float32Array(length);
    for (const chunk of this.#chunks) {
      setArrayClipped(samples, chunk.samples, chunk.frameStart - firstFrame);
    }
    return { samples, firstFrame };
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
