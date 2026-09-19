import { PlanarStreamBuffer } from "./stream-buffer.ts";
import { StreamingWsola } from "./wsola.ts";

/**
 * Streaming pitch shift built from WSOLA time stretching followed by
 * resampling. Input and output have the same duration; `pitchRatio` controls
 * output pitch relative to input pitch. `blockFrames` is the maximum expected
 * pull size; internal buffers hold enough stretched input for one output block.
 */
export class StreamingPitchShifter {
  /** Input frames buffered before the first output block can be consumed. */
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
    blockFrames,
    windowSeconds,
    searchSeconds,
  }: {
    channelCount: number;
    sampleRate: number;
    pitchRatio: number;
    blockFrames: number;
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
    // Keep two output blocks of stretched input as headroom for interpolation
    // and WSOLA's independent hop size.
    const pumpFrames = 2 * Math.ceil(blockFrames * pitchRatio);
    this.resampler = new LinearResampler({
      channelCount,
      ratio: pitchRatio,
      capacity: 2 * pumpFrames,
    });
    this.pumpBuffer = Array.from(
      { length: channelCount },
      () => new Float32Array(pumpFrames),
    );
    // The first output callback consumes blockFrames input frames overall.
    // Keep WSOLA's reserve after that consumption, including one extra
    // stretched frame for interpolation, converted back to input frames.
    const interpolationInputFrames = Math.ceil(1 / pitchRatio);
    this.latencyFrames =
      this.wsola.latencyFrames + blockFrames + interpolationInputFrames;
    // Finite callers also need enough padding to start very short streams.
    this.lookaheadFrames = Math.max(
      this.latencyFrames,
      this.wsola.lookaheadFrames + interpolationInputFrames,
    );
  }

  push(input: readonly Float32Array[]): void {
    this.wsola.push(input);
  }

  pull(output: Float32Array[]): number {
    if (this.wsola.input.length < this.latencyFrames) {
      return 0;
    }
    // Preserve backpressure between the independently paced WSOLA and resampler.
    if (this.resampler.input.getWritableLength() >= this.pumpBuffer[0].length) {
      const written = this.wsola.pull(this.pumpBuffer);
      if (written > 0) {
        this.resampler.push(this.pumpBuffer, written);
      }
    }
    return this.resampler.pull({
      output,
      outputOffset: 0,
      frames: output[0]?.length ?? 0,
    });
  }
}

/** Linear resampler whose ratio is input frames consumed per output frame. */
class LinearResampler {
  readonly input: PlanarStreamBuffer;
  private readonly ratio: number;
  private position = 0;

  constructor({
    channelCount,
    ratio,
    capacity,
  }: {
    channelCount: number;
    ratio: number;
    capacity: number;
  }) {
    this.ratio = ratio;
    this.input = new PlanarStreamBuffer({
      planeCount: channelCount,
      capacity,
    });
  }

  push(input: readonly Float32Array[], frames: number): void {
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
