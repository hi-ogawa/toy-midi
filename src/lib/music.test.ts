import { describe, expect, test } from "vitest";
import { hasMinimumGridDuration } from "./music";

describe("hasMinimumGridDuration", () => {
  test("accepts tiny floating-point underflow at large beat positions", () => {
    const gridSize = 1 / 6; // 1/8T
    const startBeat = 128.5; // around bar 33 in 4/4
    const duration = startBeat + gridSize - startBeat;

    expect(duration).toBeLessThan(gridSize);
    expect(hasMinimumGridDuration(duration, gridSize)).toBe(true);
  });

  test("rejects genuinely short durations", () => {
    const gridSize = 1 / 6;
    const shortDuration = gridSize * 0.5;

    expect(hasMinimumGridDuration(shortDuration, gridSize)).toBe(false);
  });
});
