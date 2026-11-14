import { describe, expect, it } from "vitest";
import {
  dbToPercent,
  gainToPercent,
  hzToMidi,
  logPositionToValue,
  midiToHz,
  percentToGain,
  valueToLogPosition,
} from "./music";

describe("pitch frequency conversion", () => {
  it.each([28, 40, 69, 81])("round-trips MIDI pitch %s through Hz", (midi) => {
    expect(hzToMidi(midiToHz(midi))).toBeCloseTo(midi, 10);
  });
});

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

describe("log scale mapping", () => {
  const range = { min: 20, max: 20000 };

  it("gives each decade an equal share of the range", () => {
    expect(valueToLogPosition(20, range)).toBe(0);
    expect(valueToLogPosition(200, range)).toBeCloseTo(1 / 3, 10);
    expect(valueToLogPosition(2000, range)).toBeCloseTo(2 / 3, 10);
    expect(valueToLogPosition(20000, range)).toBeCloseTo(1, 10);
  });

  it("round-trips position through value", () => {
    for (const position of [0, 0.25, 0.5, 0.9, 1]) {
      const value = logPositionToValue(position, range);
      expect(valueToLogPosition(value, range)).toBeCloseTo(position, 10);
    }
  });
});
