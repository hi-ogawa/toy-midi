import { describe, expect, it } from "vitest";
import {
  getFret,
  moveTabString,
  resolveTabPosition,
  TAB_STRING_PRESETS,
} from "./tab-annotation";

const FOUR_STRING_PITCHES = TAB_STRING_PRESETS[0].openStringPitches;
const FIVE_STRING_PITCHES = TAB_STRING_PRESETS[1].openStringPitches;

describe("tab annotation positions", () => {
  it.each([
    { pitch: 43, tabString: 1 as const, fret: 0 },
    { pitch: 48, tabString: 1 as const, fret: 5 },
    { pitch: 40, tabString: 2 as const, fret: 2 },
    {
      pitch: 27,
      tabString: 4 as const,
      openStringPitches: FOUR_STRING_PITCHES,
      fret: undefined,
    },
  ])("derives fret $fret for pitch $pitch on string $tabString", (testCase) => {
    expect(
      getFret({
        pitch: testCase.pitch,
        tabString: testCase.tabString,
        openStringPitches: testCase.openStringPitches ?? FIVE_STRING_PITCHES,
      }),
    ).toBe(testCase.fret);
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
      pitch: 48,
      openStringPitches: FOUR_STRING_PITCHES,
      tabString: undefined,
      direction: "down" as const,
      expected: { before: 1, after: 2 },
    },
    {
      pitch: 48,
      openStringPitches: FOUR_STRING_PITCHES,
      tabString: 2 as const,
      direction: "down" as const,
      expected: { before: 2, after: 3 },
    },
    {
      pitch: 48,
      openStringPitches: FOUR_STRING_PITCHES,
      tabString: 3 as const,
      direction: "up" as const,
      expected: { before: 3, after: 2 },
    },
    {
      pitch: 48,
      openStringPitches: FOUR_STRING_PITCHES,
      tabString: 1 as const,
      direction: "up" as const,
      expected: { before: 1, after: 1 },
    },
    {
      pitch: 30,
      openStringPitches: FOUR_STRING_PITCHES,
      tabString: 4 as const,
      direction: "down" as const,
      expected: { before: 4, after: 4 },
    },
    {
      pitch: 30,
      openStringPitches: FIVE_STRING_PITCHES,
      tabString: 4 as const,
      direction: "down" as const,
      expected: { before: 4, after: 5 },
    },
  ])("moves $direction from $tabString to $expected.after", (testCase) => {
    expect(
      moveTabString({
        pitch: testCase.pitch,
        openStringPitches: testCase.openStringPitches,
        tabString: testCase.tabString,
        direction: testCase.direction,
      }),
    ).toEqual(testCase.expected);
  });
});
