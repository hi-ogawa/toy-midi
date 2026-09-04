import { PlanarStreamBuffer } from "./stream-buffer.ts";
import { StreamingWsola } from "./wsola.ts";

const PUMP_FRAMES = 128;

/**
 * Streaming pitch shift built from WSOLA time stretching followed by
 * resampling. Input and output have the same duration; `pitchRatio` controls
 * output pitch relative to input pitch.
 */
export class StreamingPitchShifter {
  readonly latencyFrames: number;
  /** Future input required to render through a finite input boundary. */
  readonly lookaheadFrames: number;

  private readonly wsola: StreamingWsola;
  private readonly resampler: LinearResampler;
  private readonly pumpBuffer: Float32Array[];

  constructor({
    channelCount,
    sampleRate,
    pitchRatio,
    windowSeconds,
    searchSeconds,
  }: {
    channelCount: number;
    sampleRate: number;
    pitchRatio: number;
    windowSeconds: number;
    searchSeconds: number;
  }) {
    this.wsola = new StreamingWsola({
      channelCount,
      sampleRate,
      playbackRate: 1 / pitchRatio,
      windowSeconds,
      searchSeconds,
    });
    this.resampler = new LinearResampler({
      channelCount,
      sampleRate,
      inputFramesPerOutputFrame: pitchRatio,
    });
    this.pumpBuffer = Array.from(
      { length: channelCount },
      () => new Float32Array(PUMP_FRAMES),
    );
    this.latencyFrames = this.wsola.latencyFrames;
    this.lookaheadFrames =
      this.wsola.lookaheadFrames + Math.ceil(1 / pitchRatio);
  }

  getWritableFrames(): number {
    return this.wsola.getWritableFrames();
  }

  push(input: readonly Float32Array[]): void {
    this.wsola.push(input);
    this.pump();
  }

  pull(output: Float32Array[]): number {
    const requestedFrames = output[0]?.length ?? 0;
    let written = 0;
    while (written < requestedFrames) {
      this.pump();
      const count = this.resampler.pull({
        output,
        outputOffset: written,
        frames: requestedFrames - written,
      });
      if (count === 0) {
        break;
      }
      written += count;
    }
    return written;
  }

  private pump(): void {
    while (PUMP_FRAMES <= this.resampler.getWritableFrames()) {
      const written = this.wsola.pull(this.pumpBuffer);
      if (written === 0) {
        break;
      }
      this.resampler.push({ input: this.pumpBuffer, frames: written });
    }
  }
}

class LinearResampler {
  private readonly inputFramesPerOutputFrame: number;
  private readonly input: PlanarStreamBuffer;
  private nextInputPosition = 0;

  constructor({
    channelCount,
    sampleRate,
    inputFramesPerOutputFrame,
  }: {
    channelCount: number;
    sampleRate: number;
    inputFramesPerOutputFrame: number;
  }) {
    this.inputFramesPerOutputFrame = inputFramesPerOutputFrame;
    this.input = new PlanarStreamBuffer({
      planeCount: channelCount,
      capacity: sampleRate,
    });
  }

  getWritableFrames(): number {
    return this.input.getWritableLength();
  }

  push({
    input,
    frames,
  }: {
    input: readonly Float32Array[];
    frames: number;
  }): void {
    this.input.push(input, frames);
  }

  pull({
    output,
    outputOffset,
    frames,
  }: {
    output: Float32Array[];
    outputOffset: number;
    frames: number;
  }): number {
    let written = 0;
    for (; written < frames; written++) {
      const firstIndex = Math.floor(this.nextInputPosition);
      if (this.input.length <= firstIndex + 1) {
        break;
      }
      const fraction = this.nextInputPosition - firstIndex;
      for (let channel = 0; channel < output.length; channel++) {
        const first = this.input.get(channel, firstIndex);
        const second = this.input.get(channel, firstIndex + 1);
        output[channel][outputOffset + written] =
          first * (1 - fraction) + second * fraction;
      }
      this.nextInputPosition += this.inputFramesPerOutputFrame;
    }
    this.input.discardUntil(Math.floor(this.nextInputPosition));
    return written;
  }
}
