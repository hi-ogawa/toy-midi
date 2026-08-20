import { describe, expect, test } from "vitest";
import type { CaptureChunk } from "./capture-worklet.ts";
import {
  appendCaptureChunk,
  createRecording,
  finishRecording,
  isRecordingFull,
} from "./recording.ts";

describe("recording assembly", () => {
  test("assembles contiguous capture chunks", () => {
    const recording = createRecording(10);
    appendCaptureChunk(recording, chunk(100, [1, 2]));
    appendCaptureChunk(recording, chunk(102, [3, 4]));

    expect(finishRecording(recording)).toEqual({
      samples: new Float32Array([1, 2, 3, 4]),
      firstFrame: 100,
    });
  });

  test("leaves missing context frames silent", () => {
    const recording = createRecording(10);
    appendCaptureChunk(recording, chunk(100, [1, 2]));
    appendCaptureChunk(recording, chunk(104, [3, 4]));

    expect(finishRecording(recording)?.samples).toEqual(
      new Float32Array([1, 2, 0, 0, 3, 4]),
    );
  });

  test("uses the later chunk for overlapping context frames", () => {
    const recording = createRecording(10);
    appendCaptureChunk(recording, chunk(100, [1, 2, 3]));
    appendCaptureChunk(recording, chunk(102, [4, 5]));

    expect(finishRecording(recording)?.samples).toEqual(
      new Float32Array([1, 2, 4, 5]),
    );
  });

  test("clips the recording at its capacity", () => {
    const recording = createRecording(5);
    appendCaptureChunk(recording, chunk(100, [1, 2, 3]));
    expect(isRecordingFull(recording)).toBe(false);

    appendCaptureChunk(recording, chunk(103, [4, 5, 6]));
    expect(isRecordingFull(recording)).toBe(true);
    expect(finishRecording(recording)?.samples).toEqual(
      new Float32Array([1, 2, 3, 4, 5]),
    );
  });
});

function chunk(frameStart: number, samples: number[]): CaptureChunk {
  return { frameStart, samples: new Float32Array(samples) };
}
