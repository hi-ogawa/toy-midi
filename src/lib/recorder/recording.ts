import type { CaptureChunk } from "./capture-worklet.ts";

export type ActiveRecording = {
  samples: Float32Array;
  length: number;
  firstFrame?: number;
  nextFrame?: number;
  discontinuityFrames: number;
};

export type RecordingProgress = {
  capturedFrames: number;
  firstFrame?: number;
  discontinuityFrames: number;
  full: boolean;
};

export function createRecording(capacityFrames: number): ActiveRecording {
  return {
    samples: new Float32Array(capacityFrames),
    length: 0,
    discontinuityFrames: 0,
  };
}

export function appendCaptureChunk(
  recording: ActiveRecording,
  chunk: CaptureChunk,
): RecordingProgress {
  const count = Math.min(
    chunk.samples.length,
    recording.samples.length - recording.length,
  );
  recording.samples.set(chunk.samples.subarray(0, count), recording.length);
  recording.firstFrame ??= chunk.frameStart;
  if (recording.nextFrame !== undefined) {
    recording.discontinuityFrames += chunk.frameStart - recording.nextFrame;
  }
  recording.length += count;
  recording.nextFrame = chunk.frameStart + chunk.samples.length;

  // TODO: Write each chunk at frameStart - firstFrame so missing context frames
  // remain silent instead of being compressed out, matching Latency Checker.
  return {
    capturedFrames: recording.length,
    firstFrame: recording.firstFrame,
    discontinuityFrames: recording.discontinuityFrames,
    full: recording.length === recording.samples.length,
  };
}

export function finishRecording(recording: ActiveRecording): Float32Array {
  return recording.samples.subarray(0, recording.length);
}

export function resolveCaptureOffset({
  anchor,
  fallback,
  firstFrame,
  sampleRate,
}: {
  anchor?: { contextTime: number; timelineTime: number };
  fallback: number;
  firstFrame?: number;
  sampleRate: number;
}): number {
  // TODO: Carry the scheduled playback start as an absolute context frame so
  // this uses the same frame-delta model as Latency Checker.
  return firstFrame !== undefined && anchor
    ? anchor.timelineTime + firstFrame / sampleRate - anchor.contextTime
    : fallback;
}
