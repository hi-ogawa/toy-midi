import { describe, expect, it } from "vitest";
import { deriveTakeRegions } from "./take-regions.ts";

describe(deriveTakeRegions, () => {
  it("keeps disjoint takes in timeline order", () => {
    expect(
      deriveTakeRegions([
        { id: "first", timelineOffset: 4, duration: 2 },
        { id: "second", timelineOffset: 0, duration: 2 },
      ]),
    ).toEqual([
      {
        takeId: "second",
        timelineOffset: 0,
        sourceOffset: 0,
        duration: 2,
      },
      {
        takeId: "first",
        timelineOffset: 4,
        sourceOffset: 0,
        duration: 2,
      },
    ]);
  });

  it("lets a newer take replace the end of an older take", () => {
    expect(
      deriveTakeRegions([
        { id: "old", timelineOffset: 0, duration: 5 },
        { id: "new", timelineOffset: 3, duration: 4 },
      ]),
    ).toEqual([
      { takeId: "old", timelineOffset: 0, sourceOffset: 0, duration: 3 },
      { takeId: "new", timelineOffset: 3, sourceOffset: 0, duration: 4 },
    ]);
  });

  it("splits an older take around a contained newer take", () => {
    expect(
      deriveTakeRegions([
        { id: "old", timelineOffset: 0, duration: 10 },
        { id: "new", timelineOffset: 3, duration: 4 },
      ]),
    ).toEqual([
      { takeId: "old", timelineOffset: 0, sourceOffset: 0, duration: 3 },
      { takeId: "new", timelineOffset: 3, sourceOffset: 0, duration: 4 },
      { takeId: "old", timelineOffset: 7, sourceOffset: 7, duration: 3 },
    ]);
  });

  it("uses the newest take for equal ranges", () => {
    expect(
      deriveTakeRegions([
        { id: "old", timelineOffset: 1, duration: 4 },
        { id: "new", timelineOffset: 1, duration: 4 },
      ]),
    ).toEqual([
      { takeId: "new", timelineOffset: 1, sourceOffset: 0, duration: 4 },
    ]);
  });

  it("preserves negative timeline offsets", () => {
    expect(
      deriveTakeRegions([
        { id: "old", timelineOffset: -4, duration: 6 },
        { id: "new", timelineOffset: -2, duration: 3 },
      ]),
    ).toEqual([
      { takeId: "old", timelineOffset: -4, sourceOffset: 0, duration: 2 },
      { takeId: "new", timelineOffset: -2, sourceOffset: 0, duration: 3 },
      { takeId: "old", timelineOffset: 1, sourceOffset: 5, duration: 1 },
    ]);
  });
});
