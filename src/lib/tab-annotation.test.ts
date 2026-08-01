import { describe, expect, it } from "vitest";
import {
  formatTabPosition,
  getFret,
  getPlayableStrings,
  getTabStringColor,
  moveTabString,
  resolveTabPosition,
  resolveTabStringSetup,
  TAB_OPEN_STRING_PRESETS,
  TAB_STRING_SETUPS,
} from "./tab-annotation";

const FOUR_STRING_PITCHES = TAB_OPEN_STRING_PRESETS.fourString;
const FIVE_STRING_PITCHES = TAB_OPEN_STRING_PRESETS.fiveString;

describe("tab annotation positions", () => {
  it("maps setup definitions to their exact open pitches", () => {
    expect(
      TAB_STRING_SETUPS.map((setup) => ({
        id: setup.id,
        label: setup.label,
        resolvedId: resolveTabStringSetup(setup.openStringPitches)?.id,
      })),
    ).toEqual([
      {
        id: "fourString",
        label: "4-string bass",
        resolvedId: "fourString",
      },
      {
        id: "fiveString",
        label: "5-string bass",
        resolvedId: "fiveString",
      },
    ]);
    expect(resolveTabStringSetup([43, 38, 33, 27])).toBeUndefined();
  });

  it("assigns a distinct color to each string", () => {
    const colors = Array.from({ length: 5 }, (_, index) =>
      getTabStringColor(index + 1),
    );

    expect(colors.every(Boolean)).toBe(true);
    expect(new Set(colors.map((color) => color?.background)).size).toBe(5);
    expect(getTabStringColor(6)).toBeUndefined();
  });

  it.each([
    { position: { string: 1 as const, fret: 5 }, label: "G5" },
    { position: { string: 4 as const, fret: 12 }, label: "E12" },
    { position: { string: 5 as const, fret: 0 }, label: "B0" },
  ])("formats $label", ({ position, label }) => {
    expect(
      formatTabPosition({
        position,
        openStringPitches: FIVE_STRING_PITCHES,
      }),
    ).toBe(label);
  });

  it.each([
    { pitch: 43, string: 1 as const, fret: 0 },
    { pitch: 38, string: 2 as const, fret: 0 },
    { pitch: 33, string: 3 as const, fret: 0 },
    { pitch: 28, string: 4 as const, fret: 0 },
    { pitch: 23, string: 5 as const, fret: 0 },
    { pitch: 48, string: 1 as const, fret: 5 },
    { pitch: 40, string: 2 as const, fret: 2 },
  ])("derives fret $fret for pitch $pitch on string $string", (testCase) => {
    expect(
      getFret({
        pitch: testCase.pitch,
        string: testCase.string,
        openStringPitches: FIVE_STRING_PITCHES,
      }),
    ).toBe(testCase.fret);
  });

  it("rejects pitches below a string's open pitch", () => {
    expect(
      getFret({
        pitch: 27,
        string: 4,
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
      expected: { string: 1, fret: 0 },
    },
    {
      pitch: 42,
      openStringPitches: FOUR_STRING_PITCHES,
      expected: { string: 2, fret: 4 },
    },
    {
      pitch: 28,
      openStringPitches: FIVE_STRING_PITCHES,
      expected: { string: 4, fret: 0 },
    },
    {
      pitch: 22,
      openStringPitches: FIVE_STRING_PITCHES,
      expected: undefined,
    },
  ])("chooses the lowest-fret default for pitch $pitch", (testCase) => {
    expect(
      resolveTabPosition({
        pitch: testCase.pitch,
        openStringPitches: testCase.openStringPitches,
      }),
    ).toEqual(testCase.expected);
  });

  it("uses a playable manual string and falls back from an invalid one", () => {
    expect(
      resolveTabPosition({
        pitch: 48,
        openStringPitches: FOUR_STRING_PITCHES,
        tabString: 3,
      }),
    ).toEqual({ string: 3, fret: 15 });
    expect(
      resolveTabPosition({
        pitch: 30,
        openStringPitches: FOUR_STRING_PITCHES,
        tabString: 3,
      }),
    ).toEqual({ string: 4, fret: 2 });
  });
});

describe("moveTabString", () => {
  it.each([
    { tabString: undefined, direction: "down" as const, expected: 2 },
    { tabString: 2 as const, direction: "down" as const, expected: 3 },
    { tabString: 3 as const, direction: "up" as const, expected: 2 },
    { tabString: 1 as const, direction: "up" as const, expected: 1 },
    { tabString: 4 as const, direction: "down" as const, expected: 4 },
  ])("moves $direction from $tabString to $expected", (testCase) => {
    expect(
      moveTabString({
        pitch: 48,
        openStringPitches: FOUR_STRING_PITCHES,
        tabString: testCase.tabString,
        direction: testCase.direction,
      }),
    ).toBe(testCase.expected);
  });

  it("can move to the B string only in five-string mode", () => {
    expect(
      moveTabString({
        pitch: 30,
        openStringPitches: FOUR_STRING_PITCHES,
        tabString: 4,
        direction: "down",
      }),
    ).toBe(4);
    expect(
      moveTabString({
        pitch: 30,
        openStringPitches: FIVE_STRING_PITCHES,
        tabString: 4,
        direction: "down",
      }),
    ).toBe(5);
  });
});
