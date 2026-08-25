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
        timelineStart: 0,
        timelineEnd: 2,
      },
      {
        takeId: "first",
        timelineStart: 4,
        timelineEnd: 6,
      },
    ]);
  });

  it("lets a newer take replace the end of an older take", () => {
    expect(deriveTakeRegions([take("old", 0, 5), take("new", 3, 4)])).toEqual([
      { takeId: "old", timelineStart: 0, timelineEnd: 3 },
      { takeId: "new", timelineStart: 3, timelineEnd: 7 },
    ]);
  });

  it("splits an older take around a contained newer take", () => {
    expect(deriveTakeRegions([take("old", 0, 10), take("new", 3, 4)])).toEqual([
      { takeId: "old", timelineStart: 0, timelineEnd: 3 },
      { takeId: "new", timelineStart: 3, timelineEnd: 7 },
      { takeId: "old", timelineStart: 7, timelineEnd: 10 },
    ]);
  });

  it("uses the newest take for equal ranges", () => {
    expect(deriveTakeRegions([take("old", 1, 4), take("new", 1, 4)])).toEqual([
      { takeId: "new", timelineStart: 1, timelineEnd: 5 },
    ]);
  });

  it("preserves negative timeline offsets", () => {
    expect(deriveTakeRegions([take("old", -4, 6), take("new", -2, 3)])).toEqual(
      [
        { takeId: "old", timelineStart: -4, timelineEnd: -2 },
        { takeId: "new", timelineStart: -2, timelineEnd: 1 },
        { takeId: "old", timelineStart: 1, timelineEnd: 2 },
      ],
    );
  });
});

function take(id: string, timelineOffset: number, duration: number): TakeState {
  return { id, number: 1, timelineOffset, duration };
}
