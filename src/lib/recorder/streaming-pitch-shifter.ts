import { StreamingWsola } from "./wsola.ts";

const PUMP_FRAMES = 128;

/**
 * Streaming pitch shift built from WSOLA time stretching followed by
 * resampling. Input and output have the same duration; `pitchRatio` controls
 * output pitch relative to input pitch.
 */
export class StreamingPitchShifter {
  readonly latencyFrames: number;

  private readonly wsola: StreamingWsola;
  private readonly resampler: LinearResampler;
  private readonly pumpBuffer: Float32Array[];
  private inputFrames = 0;
  private outputFrames = 0;
  private inputFinished = false;

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
  }

  get writableFrames(): number {
    return this.wsola.writableFrames;
  }

  push(input: readonly Float32Array[]): void {
    if (this.inputFinished) {
      throw new Error("Cannot push pitch-shifter input after finish().");
    }
    this.wsola.push(input);
    this.inputFrames += input[0]?.length ?? 0;
    this.pump();
  }

  finish(): void {
    if (this.inputFinished) {
      return;
    }
    this.inputFinished = true;
    this.wsola.finish();
    this.pump();
  }

  isFinished(): boolean {
    return this.inputFinished && this.outputFrames === this.inputFrames;
  }

  pull(output: Float32Array[]): number {
    const requestedFrames = Math.min(
      output[0]?.length ?? 0,
      this.inputFrames - this.outputFrames,
    );
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
      this.outputFrames += count;
    }
    return written;
  }

  private pump(): void {
    while (PUMP_FRAMES <= this.resampler.writableFrames) {
      const written = this.wsola.pull(this.pumpBuffer);
      if (written === 0) {
        break;
      }
      this.resampler.push({ input: this.pumpBuffer, frames: written });
    }
    if (this.wsola.isFinished()) {
      this.resampler.finish();
    }
  }
}

class LinearResampler {
  private readonly inputFramesPerOutputFrame: number;
  private readonly input: Float32Array[];
  private inputBase = 0;
  private inputLength = 0;
  private inputFrames = 0;
  private outputFrames = 0;
  private nextInputPosition = 0;
  private inputFinished = false;
  private targetOutputFrames?: number;

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
    this.input = Array.from(
      { length: channelCount },
      () => new Float32Array(sampleRate),
    );
  }

  get writableFrames(): number {
    return this.input[0].length - this.inputLength;
  }

  push({
    input,
    frames,
  }: {
    input: readonly Float32Array[];
    frames: number;
  }): void {
    for (let channel = 0; channel < this.input.length; channel++) {
      this.input[channel].set(
        input[channel].subarray(0, frames),
        this.inputLength,
      );
    }
    this.inputLength += frames;
    this.inputFrames += frames;
  }

  finish(): void {
    if (this.inputFinished) {
      return;
    }
    this.inputFinished = true;
    this.targetOutputFrames = Math.ceil(
      this.inputFrames / this.inputFramesPerOutputFrame,
    );
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
    while (written < frames) {
      if (this.inputFinished && this.targetOutputFrames === this.outputFrames) {
        break;
      }
      const firstIndex = Math.floor(this.nextInputPosition);
      const secondIndex = firstIndex + 1;
      if (
        !this.inputFinished &&
        this.inputBase + this.inputLength <= secondIndex
      ) {
        break;
      }
      const fraction = this.nextInputPosition - firstIndex;
      for (let channel = 0; channel < output.length; channel++) {
        const first = this.read(channel, firstIndex);
        const second = this.read(channel, secondIndex);
        output[channel][outputOffset + written] =
          first * (1 - fraction) + second * fraction;
      }
      this.nextInputPosition += this.inputFramesPerOutputFrame;
      this.outputFrames++;
      written++;
    }
    this.discardConsumedInput();
    return written;
  }

  private read(channel: number, position: number): number {
    const index = position - this.inputBase;
    return 0 <= index && index < this.inputLength
      ? this.input[channel][index]
      : 0;
  }

  private discardConsumedInput(): void {
    const retainFrom = Math.floor(this.nextInputPosition);
    const discardFrames = Math.min(
      this.inputLength,
      Math.max(0, retainFrom - this.inputBase),
    );
    if (discardFrames === 0) {
      return;
    }
    for (const channel of this.input) {
      channel.copyWithin(0, discardFrames, this.inputLength);
    }
    this.inputBase += discardFrames;
    this.inputLength -= discardFrames;
  }
}
