import type { CaptureChunk } from "./capture-worklet.ts";

export type ActiveRecording = {
  chunks: CaptureChunk[];
  capacityFrames: number;
};

export function createRecording(capacityFrames: number): ActiveRecording {
  return { chunks: [], capacityFrames };
}

export function appendCaptureChunk(
  recording: ActiveRecording,
  chunk: CaptureChunk,
): void {
  recording.chunks.push(chunk);
}

export function isRecordingFull(recording: ActiveRecording): boolean {
  const first = recording.chunks[0];
  const last = recording.chunks.at(-1);
  return (
    first !== undefined &&
    last !== undefined &&
    last.frameStart + last.samples.length - first.frameStart >=
      recording.capacityFrames
  );
}

export function finishRecording(
  recording: ActiveRecording,
): { samples: Float32Array; firstFrame: number } | undefined {
  const firstFrame = recording.chunks[0]?.frameStart;
  if (firstFrame === undefined) {
    return undefined;
  }
  const last = recording.chunks.at(-1)!;
  const length = Math.min(
    last.frameStart + last.samples.length - firstFrame,
    recording.capacityFrames,
  );
  const samples = new Float32Array(length);
  for (const chunk of recording.chunks) {
    setArrayClipped(samples, chunk.samples, chunk.frameStart - firstFrame);
  }
  return { samples, firstFrame };
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
