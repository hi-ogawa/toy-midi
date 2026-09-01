import { AudioViewBuilder, type AudioView } from "../audio-view.ts";
import type { CaptureChunk } from "./capture-worklet.ts";

export function deriveRecordingTrim({
  duration,
  timelineOffset,
  punchRange,
}: {
  duration: number;
  timelineOffset: number;
  punchRange?: { start: number; end: number };
}): { trimStart: number; trimEnd: number } {
  if (!punchRange) {
    return { trimStart: 0, trimEnd: duration };
  }
  return {
    trimStart: Math.max(0, punchRange.start - timelineOffset),
    trimEnd: Math.min(duration, punchRange.end - timelineOffset),
  };
}

export class ActiveRecording {
  private readonly chunks: CaptureChunk[] = [];
  private readonly audioViewBuilder: AudioViewBuilder;
  private readonly startFrame: number;
  private endFrame: number;

  constructor({
    startFrame,
    sampleRate,
    waveformPointsPerSecond,
  }: {
    startFrame: number;
    sampleRate: number;
    waveformPointsPerSecond: number;
  }) {
    this.startFrame = startFrame;
    this.endFrame = startFrame;
    this.audioViewBuilder = new AudioViewBuilder(
      sampleRate,
      waveformPointsPerSecond,
    );
  }

  append(chunk: CaptureChunk): void {
    // Capture can begin before the transport-derived recording start.
    if (chunk.frameStart < this.startFrame) {
      const sampleOffset = this.startFrame - chunk.frameStart;
      chunk = {
        frameStart: this.startFrame,
        samples: chunk.samples.subarray(sampleOffset),
      };
    }
    this.chunks.push(chunk);
    this.audioViewBuilder.append(
      chunk.samples,
      chunk.frameStart - this.startFrame,
    );
    this.endFrame = Math.max(
      this.endFrame,
      chunk.frameStart + chunk.samples.length,
    );
  }

  getAudioView(): AudioView {
    return this.audioViewBuilder.view;
  }

  getDurationFrames(): number {
    // This is elapsed capture span, not accumulated PCM count. Missing frames
    // become silence during assembly and still contribute to take duration.
    return this.endFrame - this.startFrame;
  }

  finish(stopFrame: number): Float32Array | undefined {
    // Reconstruct [startFrame, stopFrame) in capture-relative coordinates.
    // Missing ranges remain zero-filled and later chunks replace overlaps.
    const length = stopFrame - this.startFrame;
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
    this.audioViewBuilder.reset();
    this.audioViewBuilder.append(samples, 0);
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
