import { describe, expect, it } from "vitest";
import { getRecorderRulerLabelEveryBars } from "./recorder";

describe(getRecorderRulerLabelEveryBars, () => {
  it.each([
    [80, 1],
    [20, 1],
    [10, 2],
    [5, 4],
  ])("uses readable bar labels at %d pixels per beat", (scale, bars) => {
    expect(getRecorderRulerLabelEveryBars(scale)).toBe(bars);
  });
});
