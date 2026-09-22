import { describe, expect, it } from "vitest";
import {
  dbToPercent,
  getMidiOctavePitches,
  getMinMax,
  gainToPercent,
  hzToMidi,
  midiToHz,
  percentToGain,
} from "./music";

describe("numeric ranges", () => {
  it("returns the minimum and maximum values", () => {
    expect(getMinMax([3, -1, 3, 2])).toEqual({ min: -1, max: 3 });
  });

  it("returns undefined for an empty list", () => {
    expect(getMinMax([])).toBeUndefined();
  });
});

describe("MIDI octave pitches", () => {
  it("returns C pitches within a visible range", () => {
    expect(getMidiOctavePitches({ minPitch: 55, maxPitch: 80 })).toEqual([
      60, 72,
    ]);
  });

  it("clips octave pitches to the MIDI range", () => {
    expect(getMidiOctavePitches({ minPitch: -10, maxPitch: 140 })).toEqual([
      0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120,
    ]);
  });
});

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
