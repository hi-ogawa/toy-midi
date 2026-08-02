import { describe, expect, it } from "vitest";
import { spellMidiPitch } from "./pitch-spelling";

describe("spellMidiPitch", () => {
  it("uses a flat chromatic fallback for flat keys", () => {
    expect(
      spellMidiPitch({
        pitch: 34,
        keySignature: { fifths: -2, mode: "minor" },
      }),
    ).toEqual({ step: "B", alter: -1, octave: 2 });
  });

  it("derives altered natural spelling from the exact key signature", () => {
    expect(
      spellMidiPitch({
        pitch: 47,
        keySignature: { fifths: -6, mode: "minor" }, // Eb minor
      }),
    ).toEqual({ step: "C", alter: -1, octave: 4 });
    expect(
      spellMidiPitch({
        pitch: 41,
        keySignature: { fifths: 6, mode: "minor" }, // D# minor
      }),
    ).toEqual({ step: "E", alter: 1, octave: 3 });
    expect(
      spellMidiPitch({
        pitch: 48,
        keySignature: { fifths: 7, mode: "major" }, // C# major
      }),
    ).toEqual({ step: "B", alter: 1, octave: 3 });
  });
});
