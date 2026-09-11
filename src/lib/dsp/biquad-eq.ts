/**
 * RBJ biquad filters derived from analog prototypes with center-frequency
 * prewarping. See docs/concepts/biquad-filter-prototypes.md for the prototype
 * design and https://www.w3.org/TR/audio-eq-cookbook/ for the coefficient table.
 */

import { clamp, dbToGain } from "../music.ts";

export const EQ_LIMITS = {
  frequency: { min: 20, max: 20000 },
  gainDb: { min: -18, max: 18 },
  q: { min: 0.1, max: 18 },
};

export type EqType =
  | "peaking"
  | "low-shelf"
  | "high-shelf"
  | "low-pass"
  | "high-pass"
  | "band-pass"
  | "notch";

export type EqParameters = {
  type: EqType;
  frequency: number;
  gain: number;
  q: number;
  bypass: boolean;
};

export type BiquadEqCoefficients = {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
};

/** Standalone biquad EQ. Continuous parameters ramp over 10 ms of processed audio. */
export class BiquadEq {
  private readonly sampleRate: number;
  private readonly rampFrames: number;
  private type: EqType = "peaking";
  // Log-space ramps make equal ratios advance evenly for frequency, gain, and Q.
  // Slots are log frequency, log gain, log Q, and linear wet mix.
  private readonly current = new Float64Array(4);
  private readonly target = new Float64Array(4);
  private remaining = 0;
  // Per-channel Direct Form I history: x[n-1], x[n-2], y[n-1], y[n-2].
  private readonly history: Float64Array[];
  // Reused while parameters ramp to keep the processing loop allocation-free.
  private readonly coefficients: BiquadEqCoefficients = {
    b0: 1,
    b1: 0,
    b2: 0,
    a1: 0,
    a2: 0,
  };

  constructor({
    sampleRate,
    channelCount,
    type,
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
    this.setParameters({ type, frequency, gain, q, bypass });
    this.reset();
  }

  /** Update targets without restarting a ramp when the targets are unchanged. */
  setParameters({
    type,
    frequency,
    gain,
    q,
    bypass,
  }: Partial<EqParameters>): void {
    for (const value of [frequency, gain, q]) {
      if (value !== undefined && !Number.isFinite(value)) {
        throw new RangeError("EQ parameters must be finite");
      }
    }
    const typeChanged = type !== undefined && type !== this.type;
    if (type !== undefined) {
      this.type = type;
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
    if (typeChanged) {
      this.updateCoefficients();
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
        // Gain filters are exact identity at unity, which also removes any tail.
        const y =
          isGainFilter(this.type) && this.current[1] === 0
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
    calculateBiquadEqCoefficients({
      type: this.type,
      sampleRate: this.sampleRate,
      frequency: Math.exp(this.current[0]),
      gain: Math.exp(this.current[1]),
      q: Math.exp(this.current[2]),
      output: this.coefficients,
    });
  }
}

export function calculateBiquadEqCoefficients({
  type,
  sampleRate,
  frequency,
  gain,
  q,
  output,
}: {
  type: EqType;
  sampleRate: number;
  frequency: number;
  gain: number;
  q: number;
  output?: BiquadEqCoefficients;
}): BiquadEqCoefficients {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const cos = Math.cos(omega);
  const sin = Math.sin(omega);
  const amplitude = Math.sqrt(gain);
  const alpha = sin / (2 * q);
  let b0: number;
  let b1: number;
  let b2: number;
  let a0: number;
  let a1: number;
  let a2: number;
  switch (type) {
    case "peaking": {
      a0 = 1 + alpha / amplitude;
      b0 = 1 + alpha * amplitude;
      b1 = -2 * cos;
      b2 = 1 - alpha * amplitude;
      a1 = b1;
      a2 = 1 - alpha / amplitude;
      break;
    }
    case "low-shelf":
    case "high-shelf": {
      // Shelf slope S=1 makes alpha independent of gain.
      const shelfAlpha = sin / Math.SQRT2;
      const twoSqrtAAlpha = 2 * Math.sqrt(amplitude) * shelfAlpha;
      if (type === "low-shelf") {
        b0 =
          amplitude * (amplitude + 1 - (amplitude - 1) * cos + twoSqrtAAlpha);
        b1 = 2 * amplitude * (amplitude - 1 - (amplitude + 1) * cos);
        b2 =
          amplitude * (amplitude + 1 - (amplitude - 1) * cos - twoSqrtAAlpha);
        a0 = amplitude + 1 + (amplitude - 1) * cos + twoSqrtAAlpha;
        a1 = -2 * (amplitude - 1 + (amplitude + 1) * cos);
        a2 = amplitude + 1 + (amplitude - 1) * cos - twoSqrtAAlpha;
      } else {
        b0 =
          amplitude * (amplitude + 1 + (amplitude - 1) * cos + twoSqrtAAlpha);
        b1 = -2 * amplitude * (amplitude - 1 + (amplitude + 1) * cos);
        b2 =
          amplitude * (amplitude + 1 + (amplitude - 1) * cos - twoSqrtAAlpha);
        a0 = amplitude + 1 - (amplitude - 1) * cos + twoSqrtAAlpha;
        a1 = 2 * (amplitude - 1 - (amplitude + 1) * cos);
        a2 = amplitude + 1 - (amplitude - 1) * cos - twoSqrtAAlpha;
      }
      break;
    }
    case "low-pass": {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = b0;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    }
    case "high-pass": {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = b0;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    }
    case "band-pass": {
      b0 = sin / 2;
      b1 = 0;
      b2 = -b0;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    }
    case "notch": {
      b0 = 1;
      b1 = -2 * cos;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = b1;
      a2 = 1 - alpha;
      break;
    }
  }
  const result = output ?? { b0: 0, b1: 0, b2: 0, a1: 0, a2: 0 };
  result.b0 = b0 / a0;
  result.b1 = b1 / a0;
  result.b2 = b2 / a0;
  result.a1 = a1 / a0;
  result.a2 = a2 / a0;
  return result;
}

/**
 * Evaluate the general biquad magnitude response using the supplied coefficients.
 * H(z) = (b0 + b1*z^-1 + b2*z^-2) / (1 + a1*z^-1 + a2*z^-2) = N/D.
 * On the frequency circle, z = exp(i*omega), so z^-k = cos(k*omega) - i*sin(k*omega).
 * Expanding N and D into real and imaginary parts gives
 * |H|^2 = |N|^2 / |D|^2 = (Nr^2 + Ni^2) / (Dr^2 + Di^2).
 * Take the square root to return the amplitude ratio |H|.
 */
export function calculateBiquadEqResponse({
  coefficients,
  sampleRate,
  frequency,
}: {
  coefficients: BiquadEqCoefficients;
  sampleRate: number;
  frequency: number;
}): number {
  const { b0, b1, b2, a1, a2 } = coefficients;
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const cos1 = Math.cos(omega);
  const sin1 = Math.sin(omega);
  const cos2 = Math.cos(2 * omega);
  const sin2 = Math.sin(2 * omega);
  const nr = b0 + b1 * cos1 + b2 * cos2;
  const ni = -b1 * sin1 - b2 * sin2;
  const dr = 1 + a1 * cos1 + a2 * cos2;
  const di = -a1 * sin1 - a2 * sin2;
  return Math.sqrt((nr ** 2 + ni ** 2) / (dr ** 2 + di ** 2));
}

export function isGainFilter(type: EqType): boolean {
  return type === "peaking" || type === "low-shelf" || type === "high-shelf";
}

export function usesQ(type: EqType): boolean {
  return type !== "low-shelf" && type !== "high-shelf";
}
