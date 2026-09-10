/**
 * Peaking EQ boosts or cuts a band around the center frequency, with Q controlling its width.
 * The biquad coefficients follow from an analog peaking filter via the bilinear transform with center-frequency prewarping.
 *
 * Math walkthrough with GPT Astra (not verified against published literature) explains how delays and feedback shape the response, constructs a local boost or cut from gain and width constraints, and derives the sample-loop coefficients:
 * https://gisthost.github.io/?fa5a99c49105d575455b4cc1154156d1/peaking-eq-derivation.html
 */

import { clamp, dbToGain } from "../music.ts";

export const EQ_LIMITS = {
  frequency: { min: 20, max: 20000 },
  gainDb: { min: -18, max: 18 },
  q: { min: 0.1, max: 18 },
};

export type EqParameters = {
  frequency: number;
  gain: number;
  q: number;
  bypass: boolean;
};

export type PeakingEqCoefficients = {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
};

/** Standalone peaking EQ. Parameters ramp over 10 ms of processed audio. */
export class PeakingEq {
  private readonly sampleRate: number;
  private readonly rampFrames: number;
  // Log-space ramps make equal ratios advance evenly for frequency, gain, and Q.
  // Slots are log frequency, log gain, log Q, and linear wet mix.
  private readonly current = new Float64Array(4);
  private readonly target = new Float64Array(4);
  private remaining = 0;
  // Per-channel Direct Form I history: x[n-1], x[n-2], y[n-1], y[n-2].
  private readonly history: Float64Array[];
  // Reused while parameters ramp to keep the processing loop allocation-free.
  private readonly coefficients: PeakingEqCoefficients = {
    b0: 1,
    b1: 0,
    b2: 0,
    a1: 0,
    a2: 0,
  };

  constructor({
    sampleRate,
    channelCount,
    frequency,
    gain,
    q,
    bypass,
  }: { sampleRate: number; channelCount: number } & EqParameters) {
    this.sampleRate = sampleRate;
    this.rampFrames = Math.max(1, Math.round(sampleRate * 0.01));
    this.history = Array.from(
      { length: channelCount },
      () => new Float64Array(4),
    );
    this.setParameters({ frequency, gain, q, bypass });
    this.reset();
  }

  /** Update targets without restarting a ramp when the targets are unchanged. */
  setParameters({ frequency, gain, q, bypass }: Partial<EqParameters>): void {
    for (const value of [frequency, gain, q]) {
      if (value !== undefined && !Number.isFinite(value)) {
        throw new RangeError("EQ parameters must be finite");
      }
    }
    let changed = false;
    const update = (index: number, value: number) => {
      if (this.target[index] !== value) {
        this.target[index] = value;
        changed = true;
      }
    };
    if (frequency !== undefined) {
      update(
        0,
        Math.log(
          Math.min(
            clamp(frequency, EQ_LIMITS.frequency.min, EQ_LIMITS.frequency.max),
            this.sampleRate * 0.499,
          ),
        ),
      );
    }
    if (gain !== undefined) {
      update(
        1,
        Math.log(
          clamp(
            gain,
            dbToGain(EQ_LIMITS.gainDb.min),
            dbToGain(EQ_LIMITS.gainDb.max),
          ),
        ),
      );
    }
    if (q !== undefined) {
      update(2, Math.log(clamp(q, EQ_LIMITS.q.min, EQ_LIMITS.q.max)));
    }
    if (bypass !== undefined) {
      update(3, bypass ? 0 : 1);
    }
    if (changed) {
      this.remaining = this.rampFrames;
    }
  }

  /** Clear signal history and settle immediately to the current targets. */
  reset(): void {
    for (const history of this.history) {
      history.fill(0);
    }
    this.current.set(this.target);
    this.remaining = 0;
    this.updateCoefficients();
  }

  /**
   * Process equally sized planar buffers with the configured channel count.
   * Input and output may be the same buffers. No processing-loop allocations.
   * Bypass keeps the filter running so re-enabling it uses current history.
   */
  process({
    input,
    output,
  }: {
    input: readonly Float32Array[];
    output: readonly Float32Array[];
  }): void {
    const frames = input[0]?.length ?? 0;
    for (let frame = 0; frame < frames; frame++) {
      if (this.remaining > 0) {
        for (let i = 0; i < this.current.length; i++) {
          this.current[i] +=
            (this.target[i] - this.current[i]) / this.remaining;
        }
        this.remaining--;
        if (this.remaining === 0) {
          this.current.set(this.target);
        }
        this.updateCoefficients();
      }
      for (let channel = 0; channel < input.length; channel++) {
        const x = input[channel][frame];
        const h = this.history[channel];
        // Direct form I retains input/output history across coefficient changes.
        // At unity gain the exact identity also removes any residual filter tail.
        const y =
          this.current[1] === 0
            ? x
            : this.coefficients.b0 * x +
              this.coefficients.b1 * h[0] +
              this.coefficients.b2 * h[1] -
              this.coefficients.a1 * h[2] -
              this.coefficients.a2 * h[3];
        h[1] = h[0];
        h[0] = x;
        h[3] = h[2];
        h[2] = y;
        const wet = this.current[3];
        output[channel][frame] =
          wet === 0 ? x : wet === 1 ? y : x + wet * (y - x);
      }
    }
  }

  private updateCoefficients(): void {
    calculatePeakingEqCoefficients({
      sampleRate: this.sampleRate,
      frequency: Math.exp(this.current[0]),
      gain: Math.exp(this.current[1]),
      q: Math.exp(this.current[2]),
      output: this.coefficients,
    });
  }
}

export function calculatePeakingEqCoefficients({
  sampleRate,
  frequency,
  gain,
  q,
  output,
}: {
  sampleRate: number;
  frequency: number;
  gain: number;
  q: number;
  output?: PeakingEqCoefficients;
}): PeakingEqCoefficients {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const amplitude = Math.sqrt(gain);
  const alpha = Math.sin(omega) / (2 * q);
  const a0 = 1 + alpha / amplitude;
  const b1 = (-2 * Math.cos(omega)) / a0;
  const result = output ?? { b0: 0, b1: 0, b2: 0, a1: 0, a2: 0 };
  result.b0 = (1 + alpha * amplitude) / a0;
  result.b1 = b1;
  result.b2 = (1 - alpha * amplitude) / a0;
  result.a1 = b1;
  result.a2 = (1 - alpha / amplitude) / a0;
  return result;
}

export function calculatePeakingEqResponse({
  coefficients,
  sampleRate,
  frequency,
}: {
  coefficients: PeakingEqCoefficients;
  sampleRate: number;
  frequency: number;
}): number {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const cos1 = Math.cos(omega);
  const sin1 = Math.sin(omega);
  const cos2 = Math.cos(2 * omega);
  const sin2 = Math.sin(2 * omega);
  const numeratorReal =
    coefficients.b0 + coefficients.b1 * cos1 + coefficients.b2 * cos2;
  const numeratorImag = -coefficients.b1 * sin1 - coefficients.b2 * sin2;
  const denominatorReal = 1 + coefficients.a1 * cos1 + coefficients.a2 * cos2;
  const denominatorImag = -coefficients.a1 * sin1 - coefficients.a2 * sin2;
  const magnitudeSquared =
    (numeratorReal ** 2 + numeratorImag ** 2) /
    (denominatorReal ** 2 + denominatorImag ** 2);
  return Math.sqrt(magnitudeSquared);
}
