import { describe, expect, test } from "vitest";
import { getTimelineGridBackground } from "./timeline-grid";

const colors = {
  bar: "bar-color",
  beat: "beat-color",
  subdivision: "subdivision-color",
};

describe(getTimelineGridBackground, () => {
  test("returns bar, beat, and subdivision layers when they are visible", () => {
    expect(
      getTimelineGridBackground({
        beatsPerBar: 4,
        colors,
        minimumPixelSpacing: 8,
        pixelsPerBeat: 80,
        scrollBeat: 1.5,
        subdivisionsPerBeat: 4,
      }),
    ).toEqual({
      backgroundImage:
        "linear-gradient(to right, bar-color 1px, transparent 1px), linear-gradient(to right, beat-color 1px, transparent 1px), linear-gradient(to right, subdivision-color 1px, transparent 1px)",
      backgroundPosition: "-120px 0, -40px 0, 0px 0",
      backgroundSize: "320px 100%, 80px 100%, 20px 100%",
    });
  });

  test("hides dense layers and coarsens bars", () => {
    expect(
      getTimelineGridBackground({
        beatsPerBar: 4,
        colors,
        minimumPixelSpacing: 8,
        pixelsPerBeat: 1,
        scrollBeat: 5,
        subdivisionsPerBeat: 4,
      }),
    ).toEqual({
      backgroundImage:
        "linear-gradient(to right, bar-color 1px, transparent 1px)",
      backgroundPosition: "-5px 0",
      backgroundSize: "8px 100%",
    });
  });
});
