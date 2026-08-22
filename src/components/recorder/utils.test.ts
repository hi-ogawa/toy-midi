import { describe, expect, test } from "vitest";
import {
  formatBarBeat,
  getRecorderBeatsPerBar,
  getRecorderSubdivisionsPerBeat,
} from "./utils";

describe(getRecorderBeatsPerBar, () => {
  test.each([
    ["3/4", 3],
    ["4/4", 4],
    ["6/8", 3],
  ] as const)("converts %s to quarter-note beats", (signature, expected) => {
    expect(getRecorderBeatsPerBar(signature)).toBe(expected);
  });
});

describe(getRecorderSubdivisionsPerBeat, () => {
  test.each([
    ["1/4", 1],
    ["1/8", 2],
    ["1/16", 4],
    ["1/32", 8],
  ] as const)(
    "converts %s to quarter-note subdivisions",
    (division, expected) => {
      expect(getRecorderSubdivisionsPerBeat(division)).toBe(expected);
    },
  );
});

describe(formatBarBeat, () => {
  test("formats compound-meter beats using the signature denominator", () => {
    expect(formatBarBeat(1.25, 120, "6/8")).toBe("01|06");
    expect(formatBarBeat(1.5, 120, "6/8")).toBe("02|01");
  });
});
