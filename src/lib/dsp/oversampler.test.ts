import { describe, expect, it } from "vitest";
import { gainToDb } from "../music";
import { Downsampler, OVERSAMPLING_FACTOR, Upsampler } from "./oversampler";

const SAMPLE_RATE = 48000;

describe(Upsampler, () => {
  it("passes an audible sine through up and down unchanged but delayed", () => {
    const input = createSine({ frequency: 1000, amplitude: 0.5 });
    const output = runRoundTrip(input);
    // The two low-passes delay by (96 − 1) / 2 high-rate samples each, and
    // output n is the low-pass at high-rate sample 4n + 3.
    const delay = (95 - 3) / OVERSAMPLING_FACTOR;
    const expected = createSine({
      frequency: 1000,
      amplitude: 0.5,
      phase: (-2 * Math.PI * 1000 * delay) / SAMPLE_RATE,
    });
    const settled = 1000;
    // Cut without a window, the kernel ripples by up to about 0.5 dB per pass.
    const gain =
      measureRms(output.slice(settled)) / measureRms(expected.slice(settled));
    expect(Math.abs(gainToDb(gain))).toBeLessThan(1);
    // Apart from that level, it's the same sine, delayed.
    for (let i = settled; i < output.length; i++) {
      expect(output[i] / gain).toBeCloseTo(expected[i], 3);
    }
  });

  it("removes content above the original Nyquist frequency on the way down", () => {
    const highRate = SAMPLE_RATE * OVERSAMPLING_FACTOR;
    const downsampler = new Downsampler();
    const block = new Float64Array(OVERSAMPLING_FACTOR);
    const output: number[] = [];
    for (let n = 0; n < 4800; n++) {
      for (let i = 0; i < OVERSAMPLING_FACTOR; i++) {
        const t = (n * OVERSAMPLING_FACTOR + i) / highRate;
        block[i] = Math.sin(2 * Math.PI * 35000 * t);
      }
      output.push(downsampler.processSample(block));
    }
    // 35 kHz would fold to 13 kHz at 48 kHz. The kernel, cut without a window,
    // is at least about 30 dB down from 29 kHz.
    expect(gainToDb(measureRms(output.slice(1000)) * Math.SQRT2)).toBeLessThan(
      -30,
    );
  });
});

function runRoundTrip(input: Float32Array): Float32Array {
  const upsampler = new Upsampler();
  const downsampler = new Downsampler();
  const block = new Float64Array(OVERSAMPLING_FACTOR);
  return input.map((x) => {
    upsampler.processSample(x, block);
    return downsampler.processSample(block);
  });
}

function createSine({
  frequency,
  amplitude,
  phase = 0,
  length = 9600,
}: {
  frequency: number;
  amplitude: number;
  phase?: number;
  length?: number;
}): Float32Array {
  return Float32Array.from(
    { length },
    (_, i) =>
      amplitude * Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE + phase),
  );
}

function measureRms(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] ** 2;
  }
  return Math.sqrt(sum / samples.length);
}
