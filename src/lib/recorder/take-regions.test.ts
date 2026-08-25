import { describe, expect, it } from "vitest";
import { deriveTakeRegions } from "./take-regions.ts";
import type { TakeState } from "./take.ts";

describe(deriveTakeRegions, () => {
  it("keeps disjoint takes in timeline order", () => {
    expect(
      deriveTakeRegions([take("first", 4, 2), take("second", 0, 2)]),
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
    expect(deriveTakeRegions([take("old", 0, 5), take("new", 3, 4)])).toEqual([
      { takeId: "old", timelineOffset: 0, sourceOffset: 0, duration: 3 },
      { takeId: "new", timelineOffset: 3, sourceOffset: 0, duration: 4 },
    ]);
  });

  it("splits an older take around a contained newer take", () => {
    expect(deriveTakeRegions([take("old", 0, 10), take("new", 3, 4)])).toEqual([
      { takeId: "old", timelineOffset: 0, sourceOffset: 0, duration: 3 },
      { takeId: "new", timelineOffset: 3, sourceOffset: 0, duration: 4 },
      { takeId: "old", timelineOffset: 7, sourceOffset: 7, duration: 3 },
    ]);
  });

  it("uses the newest take for equal ranges", () => {
    expect(deriveTakeRegions([take("old", 1, 4), take("new", 1, 4)])).toEqual([
      { takeId: "new", timelineOffset: 1, sourceOffset: 0, duration: 4 },
    ]);
  });

  it("preserves negative timeline offsets", () => {
    expect(deriveTakeRegions([take("old", -4, 6), take("new", -2, 3)])).toEqual(
      [
        { takeId: "old", timelineOffset: -4, sourceOffset: 0, duration: 2 },
        { takeId: "new", timelineOffset: -2, sourceOffset: 0, duration: 3 },
        { takeId: "old", timelineOffset: 1, sourceOffset: 5, duration: 1 },
      ],
    );
  });
});

function take(id: string, timelineOffset: number, duration: number): TakeState {
  return { id, number: 1, timelineOffset, duration };
}
