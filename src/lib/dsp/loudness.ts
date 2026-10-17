/**
 * Loudness meter following ITU-R BS.1770 for integrated loudness and true peak, and
 * EBU Tech 3342 for loudness range. The signal is K-weighted, its power is kept per
 * 100 ms segment, and the gated statistics are computed from those segments on demand.
 *
 * See [Loudness](../../../docs/concepts/loudness.md) for how weighting and gating work.
 */

import type { BiquadEqCoefficients } from "./biquad-eq.ts";
import { TruePeakDetector } from "./true-peak.ts";

export type LoudnessMeasurement = {
  /** Integrated loudness in LUFS, -Infinity when nothing passes the absolute gate */
  integrated: number;
  /** True peak in dBTP, -Infinity for digital silence */
  truePeak: number;
  /** Loudness range in LU, 0 when the signal is shorter than one 3 s window */
  loudnessRange: number;
};

const SEGMENTS_PER_SECOND = 10;
const SEGMENTS_PER_BLOCK = 4;
const SEGMENTS_PER_SHORT_TERM = 30;
const ABSOLUTE_GATE_LUFS = -70;
const INTEGRATED_RELATIVE_GATE_LU = -10;
const RANGE_RELATIVE_GATE_LU = -20;
const RANGE_LOW_PERCENTILE = 0.1;
const RANGE_HIGH_PERCENTILE = 0.95;

export class LoudnessMeter {
  private readonly framesPerSegment: number;
  private readonly filters: KWeightingFilter[];
  private readonly truePeak: TruePeakDetector;
  /** Mean square of the K-weighted signal per segment, summed over channels */
  private readonly segments: number[] = [];
  private segmentSum = 0;
  private segmentFrames = 0;

  constructor({
    sampleRate,
    channelCount,
  }: {
    sampleRate: number;
    channelCount: number;
  }) {
    this.framesPerSegment = Math.round(sampleRate / SEGMENTS_PER_SECOND);
    this.filters = Array.from(
      { length: channelCount },
      () => new KWeightingFilter(sampleRate),
    );
    this.truePeak = new TruePeakDetector(channelCount);
  }

  process(channels: readonly Float32Array[]): void {
    this.truePeak.process(channels);
    const frameCount = channels[0]?.length ?? 0;
    for (let frame = 0; frame < frameCount; frame++) {
      for (let channel = 0; channel < channels.length; channel++) {
        const weighted = this.filters[channel]!.process(
          channels[channel]![frame]!,
        );
        this.segmentSum += weighted * weighted;
      }
      this.segmentFrames++;
      if (this.segmentFrames === this.framesPerSegment) {
        this.segments.push(this.segmentSum / this.framesPerSegment);
        this.segmentSum = 0;
        this.segmentFrames = 0;
      }
    }
  }

  /** A trailing partial segment is left out, like a partial gating block. */
  measure(): LoudnessMeasurement {
    return {
      integrated: measureIntegrated(this.segments),
      truePeak: 20 * Math.log10(this.truePeak.measure()),
      loudnessRange: measureLoudnessRange(this.segments),
    };
  }
}

/**
 * 400 ms blocks overlap by 75%, so each starts one segment after the last. The integrated
 * value is the mean power of the blocks above both gates, where the relative gate sits
 * 10 LU below the mean of the blocks above the absolute gate.
 */
function measureIntegrated(segments: readonly number[]): number {
  const blocks = averageWindows(segments, SEGMENTS_PER_BLOCK).filter(
    (power) => powerToLoudness(power) > ABSOLUTE_GATE_LUFS,
  );
  if (blocks.length === 0) {
    return -Infinity;
  }
  const threshold = powerToLoudness(mean(blocks)) + INTEGRATED_RELATIVE_GATE_LU;
  return powerToLoudness(
    mean(blocks.filter((power) => powerToLoudness(power) > threshold)),
  );
}

/**
 * Loudness range is the spread between the 10th and 95th percentiles of 3 s short-term
 * loudness, taken every 100 ms, after an absolute gate and a relative gate 20 LU below
 * the mean.
 */
function measureLoudnessRange(segments: readonly number[]): number {
  const windows = averageWindows(segments, SEGMENTS_PER_SHORT_TERM).filter(
    (power) => powerToLoudness(power) > ABSOLUTE_GATE_LUFS,
  );
  if (windows.length === 0) {
    return 0;
  }
  const threshold = powerToLoudness(mean(windows)) + RANGE_RELATIVE_GATE_LU;
  const loudness = windows
    .map(powerToLoudness)
    .filter((value) => value > threshold)
    .sort((a, b) => a - b);
  const at = (percentile: number) =>
    loudness[Math.round((loudness.length - 1) * percentile)]!;
  return at(RANGE_HIGH_PERCENTILE) - at(RANGE_LOW_PERCENTILE);
}

/** Mean of every run of `size` consecutive segments. */
function averageWindows(segments: readonly number[], size: number): number[] {
  const windows: number[] = [];
  let sum = 0;
  for (let index = 0; index < segments.length; index++) {
    sum += segments[index]!;
    if (index >= size) {
      sum -= segments[index - size]!;
    }
    if (index >= size - 1) {
      windows.push(sum / size);
    }
  }
  return windows;
}

function mean(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

/** The -0.691 offset cancels K-weighting's gain at 1 kHz. */
function powerToLoudness(power: number): number {
  return -0.691 + 10 * Math.log10(power);
}

/**
 * K-weighting is a high shelf of about +4 dB above 1.5 kHz followed by a high-pass at
 * 38 Hz. BS.1770 gives the coefficients at 48 kHz, and the analog parameters below
 * reproduce them through the bilinear transform at any sample rate, following
 * libebur128.
 */
class KWeightingFilter {
  private readonly shelf: Biquad;
  private readonly highPass: Biquad;

  constructor(sampleRate: number) {
    {
      const frequency = 1681.974450955533;
      const gainDb = 3.999843853973347;
      const q = 0.7071752369554196;
      const k = Math.tan((Math.PI * frequency) / sampleRate);
      const vh = 10 ** (gainDb / 20);
      const vb = vh ** 0.4996667741545416;
      const a0 = 1 + k / q + k * k;
      this.shelf = new Biquad({
        b0: (vh + (vb * k) / q + k * k) / a0,
        b1: (2 * (k * k - vh)) / a0,
        b2: (vh - (vb * k) / q + k * k) / a0,
        a1: (2 * (k * k - 1)) / a0,
        a2: (1 - k / q + k * k) / a0,
      });
    }
    {
      const frequency = 38.13547087602444;
      const q = 0.5003270373238773;
      const k = Math.tan((Math.PI * frequency) / sampleRate);
      const a0 = 1 + k / q + k * k;
      this.highPass = new Biquad({
        b0: 1,
        b1: -2,
        b2: 1,
        a1: (2 * (k * k - 1)) / a0,
        a2: (1 - k / q + k * k) / a0,
      });
    }
  }

  process(sample: number): number {
    return this.highPass.process(this.shelf.process(sample));
  }
}

/** Transposed direct form II */
class Biquad {
  private z1 = 0;
  private z2 = 0;

  constructor(private readonly coefficients: BiquadEqCoefficients) {}

  process(x: number): number {
    const { b0, b1, b2, a1, a2 } = this.coefficients;
    const y = b0 * x + this.z1;
    this.z1 = b1 * x - a1 * y + this.z2;
    this.z2 = b2 * x - a2 * y;
    return y;
  }
}
