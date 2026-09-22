import { AudioViewBuilder, type AudioView } from "../audio-view.ts";
import type { CaptureChunk } from "./capture-worklet.ts";

export class ActiveRecording {
  private readonly audioViewBuilder: AudioViewBuilder;
  readonly startFrame: number;
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
}
