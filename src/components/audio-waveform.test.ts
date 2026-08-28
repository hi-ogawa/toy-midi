import { describe, expect, test } from "vitest";
import { getWaveformWidth } from "./audio-waveform";

describe(getWaveformWidth, () => {
  test("keeps source point spacing stable while a recording grows", () => {
    const pixelsPerSecond = 80;
    const secondsPerPoint = 0.1;
    const before = getWaveformWidth({
      pointCount: 70,
      secondsPerPoint,
      pixelsPerSecond,
    });
    const after = getWaveformWidth({
      pointCount: 80,
      secondsPerPoint,
      pixelsPerSecond,
    });

    expect(before / (70 - 1)).toBe(after / (80 - 1));
    expect(before / (70 - 1)).toBe(8);
  });
});
