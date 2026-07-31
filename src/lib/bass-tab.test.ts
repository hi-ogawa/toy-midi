import { describe, expect, it } from "vitest";
import {
  getFret,
  getPlayableStrings,
  moveBassString,
  resolveBassTabPosition,
} from "./bass-tab";

describe("bass tab positions", () => {
  it.each([
    { pitch: 43, string: 1 as const, fret: 0 },
    { pitch: 38, string: 2 as const, fret: 0 },
    { pitch: 33, string: 3 as const, fret: 0 },
    { pitch: 28, string: 4 as const, fret: 0 },
    { pitch: 23, string: 5 as const, fret: 0 },
    { pitch: 48, string: 1 as const, fret: 5 },
    { pitch: 40, string: 2 as const, fret: 2 },
  ])("derives fret $fret for pitch $pitch on string $string", (testCase) => {
    expect(getFret(testCase.pitch, testCase.string)).toBe(testCase.fret);
  });

  it("rejects pitches below a string's open pitch", () => {
    expect(getFret(27, 4)).toBeUndefined();
  });

  it("uses the B string only in five-string mode", () => {
    expect(getPlayableStrings({ pitch: 25, stringCount: 4 })).toEqual([]);
    expect(getPlayableStrings({ pitch: 25, stringCount: 5 })).toEqual([5]);
  });

  it.each([
    { pitch: 43, stringCount: 4 as const, expected: { string: 1, fret: 0 } },
    { pitch: 42, stringCount: 4 as const, expected: { string: 2, fret: 4 } },
    { pitch: 28, stringCount: 5 as const, expected: { string: 4, fret: 0 } },
    { pitch: 22, stringCount: 5 as const, expected: undefined },
  ])("chooses the lowest-fret default for pitch $pitch", (testCase) => {
    expect(
      resolveBassTabPosition({
        pitch: testCase.pitch,
        stringCount: testCase.stringCount,
      }),
    ).toEqual(testCase.expected);
  });

  it("uses a playable manual string and falls back from an invalid one", () => {
    expect(
      resolveBassTabPosition({ pitch: 48, stringCount: 4, bassString: 3 }),
    ).toEqual({ string: 3, fret: 15 });
    expect(
      resolveBassTabPosition({ pitch: 30, stringCount: 4, bassString: 3 }),
    ).toEqual({ string: 4, fret: 2 });
  });
});

describe("moveBassString", () => {
  it.each([
    { bassString: undefined, direction: "down" as const, expected: 2 },
    { bassString: 2 as const, direction: "down" as const, expected: 3 },
    { bassString: 3 as const, direction: "up" as const, expected: 2 },
    { bassString: 1 as const, direction: "up" as const, expected: 1 },
    { bassString: 4 as const, direction: "down" as const, expected: 4 },
  ])("moves $direction from $bassString to $expected", (testCase) => {
    expect(
      moveBassString({
        pitch: 48,
        stringCount: 4,
        bassString: testCase.bassString,
        direction: testCase.direction,
      }),
    ).toBe(testCase.expected);
  });

  it("can move to the B string only in five-string mode", () => {
    expect(
      moveBassString({
        pitch: 30,
        stringCount: 4,
        bassString: 4,
        direction: "down",
      }),
    ).toBe(4);
    expect(
      moveBassString({
        pitch: 30,
        stringCount: 5,
        bassString: 4,
        direction: "down",
      }),
    ).toBe(5);
  });
});
