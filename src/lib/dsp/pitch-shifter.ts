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
      ratio: pitchRatio,
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

/** Linear resampler whose ratio is input frames consumed per output frame. */
class LinearResampler {
  private readonly input: PlanarStreamBuffer;
  private readonly ratio: number;
  private position = 0;

  constructor({
    channelCount,
    sampleRate,
    ratio,
  }: {
    channelCount: number;
    sampleRate: number;
    ratio: number;
  }) {
    this.ratio = ratio;
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
      const i = Math.floor(this.position);
      if (this.input.length <= i + 1) {
        break;
      }
      const t = this.position - i;
      for (let channel = 0; channel < output.length; channel++) {
        const x = this.input.get(channel, i);
        const y = this.input.get(channel, i + 1);
        output[channel][outputOffset + written] = x * (1 - t) + y * t;
      }
      this.position += this.ratio;
    }
    this.input.discardUntil(Math.floor(this.position));
    return written;
  }
}
