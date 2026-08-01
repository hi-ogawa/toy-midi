import { describe, expect, it } from "vitest";
import type { TabString } from "../types";
import {
  formatTabPosition,
  getFret,
  getPlayableStrings,
  getTabStringColor,
  moveTabString,
  resolveTabPosition,
  resolveTabStringPreset,
  TAB_STRING_PRESETS,
} from "./tab-annotation";

const FOUR_STRING_PITCHES = TAB_STRING_PRESETS[0].openStringPitches;
const FIVE_STRING_PITCHES = TAB_STRING_PRESETS[1].openStringPitches;

describe("tab annotation positions", () => {
  it("maps presets to their exact open pitches", () => {
    expect(
      TAB_STRING_PRESETS.map((preset) => ({
        id: preset.id,
        label: preset.label,
        resolvedId: resolveTabStringPreset(preset.openStringPitches)?.id,
      })),
    ).toEqual([
      {
        id: "fourStringBass",
        label: "4-string bass (EADG)",
        resolvedId: "fourStringBass",
      },
      {
        id: "fiveStringBass",
        label: "5-string bass (BEADG)",
        resolvedId: "fiveStringBass",
      },
    ]);
    expect(resolveTabStringPreset([43, 38, 33, 27])).toBeUndefined();
  });

  it("assigns a distinct color to each string", () => {
    const colors = Array.from({ length: 5 }, (_, index) =>
      getTabStringColor((index + 1) as TabString),
    );

    expect(colors.every(Boolean)).toBe(true);
    expect(new Set(colors.map((color) => color?.background)).size).toBe(5);
  });

  it.each([
    { position: { tabString: 1 as const, fret: 5 }, label: "G5" },
    { position: { tabString: 4 as const, fret: 12 }, label: "E12" },
    { position: { tabString: 5 as const, fret: 0 }, label: "B0" },
  ])("formats $label", ({ position, label }) => {
    expect(
      formatTabPosition({
        position,
        openStringPitches: FIVE_STRING_PITCHES,
      }),
    ).toBe(label);
  });

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
    ).toEqual({ tabString: 3, fret: 15 });
    expect(
      resolveTabPosition({
        pitch: 30,
        openStringPitches: FOUR_STRING_PITCHES,
        tabString: 3,
      }),
    ).toEqual({ tabString: 4, fret: 2 });
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
