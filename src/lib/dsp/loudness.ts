/**
 * Loudness meter following ITU-R BS.1770 for loudness and EBU Tech 3342 for loudness
 * range. The meter keeps the power of the K-weighted signal per 100 ms
 * segment, and integrated loudness and loudness range are statistics of those powers.
 *
 * See [Loudness](../../../docs/concepts/loudness.md) for how weighting and gating work.
 */

import { BiquadEqFixed } from "./biquad-eq.ts";

export type LoudnessMeasurement = {
  /**
   * K-weighted mean square per 100 ms, summed over channels. Index i covers i × 100 ms to
   * (i + 1) × 100 ms, and a trailing partial segment is dropped. Loudness in LUFS is
   * -0.691 + 10 log10(power), and silence is 0.
   */
  powers: number[];
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
  private readonly powers: number[] = [];
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
  }

  process(channels: readonly Float32Array[]): void {
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
        this.powers.push(this.segmentSum / this.framesPerSegment);
        this.segmentSum = 0;
        this.segmentFrames = 0;
      }
    }
  }

  measure(): LoudnessMeasurement {
    return {
      powers: [...this.powers],
    };
  }
}

/**
 * Integrated loudness in LUFS, -Infinity when nothing passes the absolute gate.
 * 400 ms blocks overlap by 75%, so each starts one segment after the last. The integrated
 * value is the mean power of the blocks above both gates, where the relative gate sits
 * 10 LU below the mean of the blocks above the absolute gate.
 */
export function measureIntegratedLoudness(powers: readonly number[]): number {
  const blocks = averageWindows(powers, SEGMENTS_PER_BLOCK).filter(
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
 * Loudness range in LU, 0 when the signal is shorter than one 3 s window.
 * It is the spread between the 10th and 95th percentiles of 3 s short-term
 * loudness, taken every 100 ms, after an absolute gate and a relative gate 20 LU below
 * the mean.
 */
export function measureLoudnessRange(powers: readonly number[]): number {
  const windows = averageWindows(powers, SEGMENTS_PER_SHORT_TERM).filter(
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

/** Mean of every run of `size` consecutive powers. */
function averageWindows(powers: readonly number[], size: number): number[] {
  const windows: number[] = [];
  let sum = 0;
  for (let index = 0; index < powers.length; index++) {
    sum += powers[index]!;
    if (index >= size) {
      sum -= powers[index - size]!;
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
 * 38 Hz. BS.1770 gives the coefficients only at 48 kHz. The analog parameters below
 * are libebur128's unofficial fit, which reproduces them at 48 kHz through the
 * bilinear transform. The standard doesn't define other sample rates.
 */
class KWeightingFilter {
  private readonly shelf: BiquadEqFixed;
  private readonly highPass: BiquadEqFixed;

  constructor(sampleRate: number) {
    {
      const frequency = 1681.974450955533;
      const gainDb = 3.999843853973347;
      const q = 0.7071752369554196;
      const k = Math.tan((Math.PI * frequency) / sampleRate);
      const vh = 10 ** (gainDb / 20);
      const vb = vh ** 0.4996667741545416;
      const a0 = 1 + k / q + k * k;
      this.shelf = new BiquadEqFixed({
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
      this.highPass = new BiquadEqFixed({
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
