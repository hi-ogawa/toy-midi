import {
  type BiquadEqCoefficients,
  calculateBiquadEqCoefficients,
} from "./biquad-eq.ts";

/**
 * One note's resonant low-pass: the track EQ's direct-form-I biquad with its
 * coefficients recomputed on every sample, so the cutoff follows an envelope
 * exactly instead of trailing it by the EQ's 10 ms parameter ramp.
 */
export class SynthLowpass {
  private readonly coefficients: BiquadEqCoefficients = {
    b0: 1,
    b1: 0,
    b2: 0,
    a1: 0,
    a2: 0,
  };
  // Direct form I history: x[n-1], x[n-2], y[n-1], y[n-2]
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(private readonly sampleRate: number) {}

  /** Filters one sample at this sample's cutoff in Hz and Q. */
  process(input: number, cutoff: number, q: number): number {
    const { b0, b1, b2, a1, a2 } = calculateBiquadEqCoefficients(
      { sampleRate: this.sampleRate, output: this.coefficients },
      { type: "low-pass", frequency: cutoff, q },
    );
    const output =
      b0 * input + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = output;
    return output;
  }
}
