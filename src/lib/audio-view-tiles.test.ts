import { describe, expect, test } from "vitest";
import { getAudioViewTiles } from "./audio-view.ts";

describe(getAudioViewTiles, () => {
  test("keeps completed tile intervals stable as the visible range grows", () => {
    const before = getAudioViewTiles({
      audioDuration: 7,
      pixelsPerSecond: 80,
      rangeStart: 0,
      rangeEnd: 7,
      visibleStart: 0,
      visibleEnd: 7,
      tilePixelWidth: 256,
    });
    const after = getAudioViewTiles({
      audioDuration: 8,
      pixelsPerSecond: 80,
      rangeStart: 0,
      rangeEnd: 8,
      visibleStart: 0,
      visibleEnd: 8,
      tilePixelWidth: 256,
    });

    expect(after.slice(0, -1)).toEqual(before.slice(0, -1));
    expect(before.slice(0, -1)).toEqual([
      { index: 0, queryStart: 0, queryEnd: 3.2 },
      { index: 1, queryStart: 3.2, queryEnd: 6.4 },
    ]);
    expect(before.at(-1)).toEqual({ index: 2, queryStart: 6.4, queryEnd: 7 });
    expect(after.at(-1)).toEqual({ index: 2, queryStart: 6.4, queryEnd: 8 });
  });

  test("aligns tiles to source time when the rendered range is trimmed", () => {
    expect(
      getAudioViewTiles({
        audioDuration: 10,
        pixelsPerSecond: 80,
        rangeStart: 4,
        rangeEnd: 8,
        visibleStart: 4,
        visibleEnd: 8,
        tilePixelWidth: 256,
      }),
    ).toEqual([
      { index: 1, queryStart: 3.2, queryEnd: 6.4 },
      { index: 2, queryStart: 6.4, queryEnd: 9.600000000000001 },
    ]);
  });
});
