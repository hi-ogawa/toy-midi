import { describe, expect, it } from "vitest";
import { deriveTakeRegions } from "./take-regions.ts";
import type { TakeState } from "./take.ts";

describe(deriveTakeRegions, () => {
  it("keeps disjoint takes in timeline order", () => {
    const first = take("first", 4, 2);
    const second = take("second", 0, 2);
    expect(deriveTakeRegions([first, second])).toEqual([
      {
        take: second,
        timelineStart: 0,
        timelineEnd: 2,
      },
      {
        take: first,
        timelineStart: 4,
        timelineEnd: 6,
      },
    ]);
  });

  it("lets a newer take replace the end of an older take", () => {
    const old = take("old", 0, 5);
    const next = take("new", 3, 4);
    expect(deriveTakeRegions([old, next])).toEqual([
      { take: old, timelineStart: 0, timelineEnd: 3 },
      { take: next, timelineStart: 3, timelineEnd: 7 },
    ]);
  });

  it("splits an older take around a contained newer take", () => {
    const old = take("old", 0, 10);
    const next = take("new", 3, 4);
    expect(deriveTakeRegions([old, next])).toEqual([
      { take: old, timelineStart: 0, timelineEnd: 3 },
      { take: next, timelineStart: 3, timelineEnd: 7 },
      { take: old, timelineStart: 7, timelineEnd: 10 },
    ]);
  });

  it("uses the newest take for equal ranges", () => {
    const old = take("old", 1, 4);
    const next = take("new", 1, 4);
    expect(deriveTakeRegions([old, next])).toEqual([
      { take: next, timelineStart: 1, timelineEnd: 5 },
    ]);
  });

  it("preserves negative timeline offsets", () => {
    const old = take("old", -4, 6);
    const next = take("new", -2, 3);
    expect(deriveTakeRegions([old, next])).toEqual([
      { take: old, timelineStart: -4, timelineEnd: -2 },
      { take: next, timelineStart: -2, timelineEnd: 1 },
      { take: old, timelineStart: 1, timelineEnd: 2 },
    ]);
  });

  it("uses the trimmed source interval on the timeline", () => {
    const trimmed = { ...take("take", 3, 6), trimStart: 1, trimEnd: 5 };
    expect(deriveTakeRegions([trimmed])).toEqual([
      { take: trimmed, timelineStart: 4, timelineEnd: 8 },
    ]);
  });
});

function take(id: string, timelineOffset: number, duration: number): TakeState {
  return {
    id,
    number: 1,
    muted: false,
    soloed: false,
    timelineOffset,
    duration,
    trimStart: 0,
    trimEnd: duration,
  };
}
