import { describe, expect, it } from "vitest";
import { dbToPercent, gainToPercent, percentToGain } from "./volume";

describe("volume fader mapping", () => {
  it("places unity gain near Ardour's fader position", () => {
    const unityPercent = gainToPercent(1);
    expect(unityPercent).toBeCloseTo(78.18, 2);
    expect(dbToPercent(0)).toBeCloseTo(unityPercent, 5);
  });

  it("maps extremes to expected gain", () => {
    expect(percentToGain(0)).toBeCloseTo(0, 6);
    expect(percentToGain(100)).toBeCloseTo(2, 3);
  });

  it("round-trips percent through gain", () => {
    const samples = [5, 25, 50, 75, 90];
    for (const value of samples) {
      const roundtrip = gainToPercent(percentToGain(value));
      expect(roundtrip).toBeCloseTo(value, 3);
    }
  });
});
