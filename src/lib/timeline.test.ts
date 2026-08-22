import { describe, expect, test } from "vitest";
import { beatsToSeconds, getCoarseInterval, secondsToBeats } from "./timeline";

describe("timeline conversions", () => {
  test("converts between seconds and beats", () => {
    expect(secondsToBeats(1.5, 120)).toBe(3);
    expect(beatsToSeconds(3, 120)).toBe(1.5);
  });
});

describe(getCoarseInterval, () => {
  test("returns the first power-of-two multiple with enough spacing", () => {
    expect(
      getCoarseInterval({
        baseInterval: 4,
        minimumSpacing: 30,
        pixelsPerUnit: 2,
      }),
    ).toBe(16);
  });

  test("keeps an interval that is already visible", () => {
    expect(
      getCoarseInterval({
        baseInterval: 4,
        minimumSpacing: 30,
        pixelsPerUnit: 10,
      }),
    ).toBe(4);
  });
});
