/**
 * Fixed second-order filters for processing whose response never changes
 * while it runs, such as an amp's voicing. Coefficients follow the Audio EQ
 * Cookbook (Robert Bristow-Johnson), the same bilinear-transform design as
 * the peaking EQ in `biquad-eq.ts`.
 *
 * See [Designing low-pass and high-pass filters](../../../docs/concepts/digital-filters/low-pass-and-high-pass.md)
 * for the derivation of the coefficients.
 */

import { dbToGain } from "../music.ts";
import {
  type BiquadEqCoefficients,
  calculateBiquadEqCoefficients,
} from "./biquad-eq.ts";

/** Q of a Butterworth second-order section, the flattest passband. */
export const BUTTERWORTH_Q = Math.SQRT1_2;

export type BiquadFilterSpec =
  | { type: "highpass" | "lowpass"; frequency: number; q?: number }
  | { type: "peaking"; frequency: number; gainDb: number; q: number };

/**
 * Q of a peaking filter whose bandwidth is `octaves` wide between the
 * half-gain points: Q = √(2^N) / (2^N − 1). One octave is Q ≈ 1.41.
 */
export function convertOctavesToQ(octaves: number): number {
  const ratio = 2 ** octaves;
  return Math.sqrt(ratio) / (ratio - 1);
}

export function calculateBiquadFilterCoefficients(
  spec: BiquadFilterSpec,
  sampleRate: number,
): BiquadEqCoefficients {
  if (spec.type === "peaking") {
    return calculateBiquadEqCoefficients({
      sampleRate,
      frequency: spec.frequency,
      gain: dbToGain(spec.gainDb),
      q: spec.q,
    });
  }
  // With ω = 2πf/fs and α = sin ω / 2Q, both filters share the denominator
  // 1 + α − 2cos ω·z⁻¹ + (1 − α)·z⁻², and their numerators put a double zero
  // at z = 1 (high-pass, no DC) or z = −1 (low-pass, no Nyquist).
  const omega = (2 * Math.PI * spec.frequency) / sampleRate;
  const cos = Math.cos(omega);
  const alpha = Math.sin(omega) / (2 * (spec.q ?? BUTTERWORTH_Q));
  const a0 = 1 + alpha;
  const edge = spec.type === "highpass" ? (1 + cos) / 2 : (1 - cos) / 2;
  return {
    b0: edge / a0,
    b1: ((spec.type === "highpass" ? -2 : 2) * edge) / a0,
    b2: edge / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

/** One mono filter with fixed coefficients, processed a sample at a time. */
export class BiquadFilter {
  private readonly b0: number;
  private readonly b1: number;
  private readonly b2: number;
  private readonly a1: number;
  private readonly a2: number;
  // Direct Form I history: x[n-1], x[n-2], y[n-1], y[n-2].
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(spec: BiquadFilterSpec, sampleRate: number) {
    ({
      b0: this.b0,
      b1: this.b1,
      b2: this.b2,
      a1: this.a1,
      a2: this.a2,
    } = calculateBiquadFilterCoefficients(spec, sampleRate));
  }

  process(x: number): number {
    const y =
      this.b0 * x +
      this.b1 * this.x1 +
      this.b2 * this.x2 -
      this.a1 * this.y1 -
      this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}
