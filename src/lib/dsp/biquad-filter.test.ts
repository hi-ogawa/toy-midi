import { describe, expect, it } from "vitest";
import { calculateBiquadEqResponse } from "./biquad-eq";
import {
  calculateBiquadFilterCoefficients,
  convertOctavesToQ,
} from "./biquad-filter";

const SAMPLE_RATE = 48000;

describe(calculateBiquadFilterCoefficients, () => {
  it.each(["highpass", "lowpass"] as const)(
    "puts a Butterworth %s 3 dB down at its cutoff",
    (type) => {
      const coefficients = calculateBiquadFilterCoefficients(
        { type, frequency: 1000 },
        SAMPLE_RATE,
      );
      const response = (frequency: number) =>
        toDb(
          calculateBiquadEqResponse({
            coefficients,
            sampleRate: SAMPLE_RATE,
            frequency,
          }),
        );
      expect(response(1000)).toBeCloseTo(-3.01, 1);
      expect(response(type === "highpass" ? 10000 : 100)).toBeCloseTo(0, 1);
      expect(response(type === "highpass" ? 100 : 10000)).toBeLessThan(-35);
    },
  );

  it("converts bandwidth in octaves to Q", () => {
    expect(convertOctavesToQ(1)).toBeCloseTo(Math.SQRT2, 6);
    expect(convertOctavesToQ(1.39)).toBeCloseTo(1, 2);
  });
});

// Unlike gainToDb, not floored at the mixer's −60 dB.
function toDb(gain: number): number {
  return 20 * Math.log10(gain);
}
