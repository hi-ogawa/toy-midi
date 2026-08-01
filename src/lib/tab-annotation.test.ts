import { describe, expect, it } from "vitest";
import {
  getFret,
  getPlayableStrings,
  moveTabString,
  resolveTabPosition,
  TAB_STRING_PRESETS,
} from "./tab-annotation";

const FOUR_STRING_PITCHES = TAB_STRING_PRESETS[0].openStringPitches;
const FIVE_STRING_PITCHES = TAB_STRING_PRESETS[1].openStringPitches;

describe("tab annotation positions", () => {
  it.each([
    { pitch: 43, tabString: 1 as const, fret: 0 },
    { pitch: 38, tabString: 2 as const, fret: 0 },
    { pitch: 33, tabString: 3 as const, fret: 0 },
    { pitch: 28, tabString: 4 as const, fret: 0 },
    { pitch: 23, tabString: 5 as const, fret: 0 },
    { pitch: 48, tabString: 1 as const, fret: 5 },
    { pitch: 40, tabString: 2 as const, fret: 2 },
  ])("derives fret $fret for pitch $pitch on string $tabString", (testCase) => {
    expect(
      getFret({
        pitch: testCase.pitch,
        tabString: testCase.tabString,
        openStringPitches: FIVE_STRING_PITCHES,
      }),
    ).toBe(testCase.fret);
  });

  it("rejects pitches below a string's open pitch", () => {
    expect(
      getFret({
        pitch: 27,
        tabString: 4,
        openStringPitches: FOUR_STRING_PITCHES,
      }),
    ).toBeUndefined();
  });

  it("uses the B string only in five-string mode", () => {
    expect(
      getPlayableStrings({
        pitch: 25,
        openStringPitches: FOUR_STRING_PITCHES,
      }),
    ).toEqual([]);
    expect(
      getPlayableStrings({
        pitch: 25,
        openStringPitches: FIVE_STRING_PITCHES,
      }),
    ).toEqual([5]);
  });

  it.each([
    {
      pitch: 43,
      openStringPitches: FOUR_STRING_PITCHES,
      expected: { tabString: 1, fret: 0 },
    },
    {
      pitch: 42,
      openStringPitches: FOUR_STRING_PITCHES,
      expected: { tabString: 2, fret: 4 },
    },
    {
      pitch: 28,
      openStringPitches: FIVE_STRING_PITCHES,
      expected: { tabString: 4, fret: 0 },
    },
    {
      pitch: 22,
      openStringPitches: FIVE_STRING_PITCHES,
      expected: undefined,
    },
    {
      pitch: 48,
      openStringPitches: FOUR_STRING_PITCHES,
      tabString: 3 as const,
      expected: { tabString: 3, fret: 15 },
    },
    {
      pitch: 30,
      openStringPitches: FOUR_STRING_PITCHES,
      tabString: 3 as const,
      expected: { tabString: 4, fret: 2 },
    },
  ])(
    "resolves tab position for pitch $pitch from string $tabString",
    (testCase) => {
      expect(
        resolveTabPosition({
          pitch: testCase.pitch,
          openStringPitches: testCase.openStringPitches,
          tabString: testCase.tabString,
        }),
      ).toEqual(testCase.expected);
    },
  );
});

describe("moveTabString", () => {
  it.each([
    {
      tabString: undefined,
      direction: "down" as const,
      expected: { before: 1, after: 2 },
    },
    {
      tabString: 2 as const,
      direction: "down" as const,
      expected: { before: 2, after: 3 },
    },
    {
      tabString: 3 as const,
      direction: "up" as const,
      expected: { before: 3, after: 2 },
    },
    {
      tabString: 1 as const,
      direction: "up" as const,
      expected: { before: 1, after: 1 },
    },
    {
      tabString: 4 as const,
      direction: "down" as const,
      expected: { before: 4, after: 4 },
    },
  ])("moves $direction from $tabString to $expected.after", (testCase) => {
    expect(
      moveTabString({
        pitch: 48,
        openStringPitches: FOUR_STRING_PITCHES,
        tabString: testCase.tabString,
        direction: testCase.direction,
      }),
    ).toEqual(testCase.expected);
  });

  it("can move to the B string only in five-string mode", () => {
    expect(
      moveTabString({
        pitch: 30,
        openStringPitches: FOUR_STRING_PITCHES,
        tabString: 4,
        direction: "down",
      }),
    ).toEqual({ before: 4, after: 4 });
    expect(
      moveTabString({
        pitch: 30,
        openStringPitches: FIVE_STRING_PITCHES,
        tabString: 4,
        direction: "down",
      }),
    ).toEqual({ before: 4, after: 5 });
  });
});
