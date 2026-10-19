/**
 * Second-order (biquad) filters designed from analog prototypes through the
 * bilinear transform.
 *
 * - The peaking EQ boosts or cuts a band around the center frequency, with Q
 *   controlling its width, and ramps its parameters while it runs. See
 *   [Digital filters](../../../docs/concepts/digital-filters/README.md) for
 *   its response design and coefficient derivation.
 * - The fixed filters serve processing whose response never changes while it
 *   runs, such as an amp's voicing. See
 *   [Designing low-pass and high-pass filters](../../../docs/concepts/digital-filters/low-pass-and-high-pass.md)
 *   for their derivation.
 */

import { clamp, dbToGain } from "../music.ts";

export const EQ_LIMITS = {
  frequency: { min: 20, max: 20000 },
  gainDb: { min: -18, max: 18 },
  q: { min: 0.1, max: 18 },
};

export type EqParameters = {
  /** Center frequency in Hz */
  frequency: number;
  /** Gain at the center frequency, so 1 is flat */
  gain: number;
  /** Bandwidth, higher is narrower */
  q: number;
  bypass: boolean;
};

export const DEFAULT_PARAMETERS: EqParameters = {
  frequency: 1000,
  gain: 1,
  q: 1,
  bypass: false,
};

export type BiquadEqCoefficients = {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
};

export type BiquadFilterSpec =
  | { type: "peaking"; frequency: number; gain: number; q: number }
  | { type: "low-pass" | "high-pass"; frequency: number; q: number };

/** Standalone biquad EQ. Parameters ramp over 10 ms of processed audio. */
export class BiquadEq {
  private readonly sampleRate: number;
  private readonly type: "peaking" | "low-pass" | "high-pass";
  private readonly rampFrames: number;
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

  constructor(
    options: {
      sampleRate: number;
      channelCount: number;
      bypass?: boolean;
    } & BiquadFilterSpec,
  ) {
    this.sampleRate = options.sampleRate;
    this.type = options.type;
    this.rampFrames = Math.max(1, Math.round(options.sampleRate * 0.01));
    this.history = Array.from(
      { length: options.channelCount },
      () => new Float64Array(4),
    );
    this.setParameters({
      frequency: options.frequency,
      gain: options.type === "peaking" ? options.gain : 1,
      q: options.q,
      bypass: options.bypass ?? false,
    });
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
        // At unity gain a peaking EQ is the exact identity, which also removes
        // any residual filter tail.
        const y =
          this.type === "peaking" && this.current[1] === 0
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
    const frequency = Math.exp(this.current[0]);
    const q = Math.exp(this.current[2]);
    if (this.type === "peaking") {
      calculateBiquadEqCoefficients({
        type: "peaking",
        sampleRate: this.sampleRate,
        frequency,
        gain: Math.exp(this.current[1]),
        q,
        output: this.coefficients,
      });
    } else {
      calculateBiquadEqCoefficients({
        type: this.type,
        sampleRate: this.sampleRate,
        frequency,
        q,
        output: this.coefficients,
      });
    }
  }
}

export function calculateBiquadEqCoefficients(
  parameters: BiquadFilterSpec & {
    sampleRate: number;
    output?: BiquadEqCoefficients;
  },
): BiquadEqCoefficients {
  const omega = (2 * Math.PI * parameters.frequency) / parameters.sampleRate;
  const cos = Math.cos(omega);
  const alpha = Math.sin(omega) / (2 * parameters.q);
  const result = parameters.output ?? { b0: 0, b1: 0, b2: 0, a1: 0, a2: 0 };
  switch (parameters.type) {
    case "peaking": {
      const amplitude = Math.sqrt(parameters.gain);
      const a0 = 1 + alpha / amplitude;
      result.b0 = (1 + alpha * amplitude) / a0;
      result.b1 = (-2 * cos) / a0;
      result.b2 = (1 - alpha * amplitude) / a0;
      result.a1 = result.b1;
      result.a2 = (1 - alpha / amplitude) / a0;
      break;
    }
    case "low-pass":
    case "high-pass": {
      // Both share the denominator 1 + α − 2cos ω·z⁻¹ + (1 − α)·z⁻², and
      // their numerators put a double zero at z = 1 (high-pass, no DC) or
      // z = −1 (low-pass, no Nyquist).
      const a0 = 1 + alpha;
      const highPass = parameters.type === "high-pass";
      const edge = highPass ? (1 + cos) / 2 : (1 - cos) / 2;
      result.b0 = edge / a0;
      result.b1 = ((highPass ? -2 : 2) * edge) / a0;
      result.b2 = result.b0;
      result.a1 = (-2 * cos) / a0;
      result.a2 = (1 - alpha) / a0;
      break;
    }
  }
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

/**
 * Q of a Butterworth high-pass or low-pass, the flattest passband, which puts
 * the cutoff at −3 dB.
 */
export const BUTTERWORTH_Q = Math.SQRT1_2;

/**
 * Q of a peaking filter whose bandwidth is `octaves` wide between the
 * half-gain points. See
 * [Measure the halfway bandwidth](../../../docs/concepts/digital-filters/peaking-eq.md#measure-the-halfway-bandwidth)
 * for the derivation.
 */
export function convertOctavesToQ(octaves: number): number {
  const ratio = 2 ** octaves;
  return Math.sqrt(ratio) / (ratio - 1);
}
