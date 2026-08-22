import { describe, expect, test } from "vitest";
import { calculateTimelineGridLayers } from "./timeline-grid";

describe(calculateTimelineGridLayers, () => {
  test("returns bar, beat, and subdivision layers when they are visible", () => {
    expect(
      calculateTimelineGridLayers({
        beatsPerBar: 4,
        minimumPixelSpacing: 8,
        pixelsPerBeat: 80,
        scrollBeat: 1.5,
        subdivisionsPerBeat: 4,
      }),
    ).toEqual([
      {
        intervalBeats: 4,
        kind: "bar",
        offsetPixels: -120,
        spacingPixels: 320,
      },
      {
        intervalBeats: 1,
        kind: "beat",
        offsetPixels: -40,
        spacingPixels: 80,
      },
      {
        intervalBeats: 0.25,
        kind: "subdivision",
        offsetPixels: -0,
        spacingPixels: 20,
      },
    ]);
  });

  test("hides dense layers and coarsens bars", () => {
    expect(
      calculateTimelineGridLayers({
        beatsPerBar: 4,
        minimumPixelSpacing: 8,
        pixelsPerBeat: 1,
        scrollBeat: 5,
        subdivisionsPerBeat: 4,
      }),
    ).toEqual([
      {
        intervalBeats: 8,
        kind: "bar",
        offsetPixels: -5,
        spacingPixels: 8,
      },
    ]);
  });
});
