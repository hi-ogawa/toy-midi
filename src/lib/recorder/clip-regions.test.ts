import { describe, expect, it } from "vitest";
import type { AudioClip } from "./audio-clip.ts";
import { deriveClipRegions } from "./clip-regions.ts";

describe(deriveClipRegions, () => {
  it("keeps disjoint clips in timeline order", () => {
    const first = clip("first", 4, 2);
    const second = clip("second", 0, 2);
    expect(deriveClipRegions([first, second])).toEqual([
      {
        clip: second,
        timelineStart: 0,
        timelineEnd: 2,
      },
      {
        clip: first,
        timelineStart: 4,
        timelineEnd: 6,
      },
    ]);
  });

  it("lets a newer clip replace the end of an older clip", () => {
    const old = clip("old", 0, 5);
    const next = clip("new", 3, 4);
    expect(deriveClipRegions([old, next])).toEqual([
      { clip: old, timelineStart: 0, timelineEnd: 3 },
      { clip: next, timelineStart: 3, timelineEnd: 7 },
    ]);
  });

  it("splits an older clip around a contained newer clip", () => {
    const old = clip("old", 0, 10);
    const next = clip("new", 3, 4);
    expect(deriveClipRegions([old, next])).toEqual([
      { clip: old, timelineStart: 0, timelineEnd: 3 },
      { clip: next, timelineStart: 3, timelineEnd: 7 },
      { clip: old, timelineStart: 7, timelineEnd: 10 },
    ]);
  });

  it("uses the newest clip for equal ranges", () => {
    const old = clip("old", 1, 4);
    const next = clip("new", 1, 4);
    expect(deriveClipRegions([old, next])).toEqual([
      { clip: next, timelineStart: 1, timelineEnd: 5 },
    ]);
  });

  it("preserves negative timeline offsets", () => {
    const old = clip("old", -4, 6);
    const next = clip("new", -2, 3);
    expect(deriveClipRegions([old, next])).toEqual([
      { clip: old, timelineStart: -4, timelineEnd: -2 },
      { clip: next, timelineStart: -2, timelineEnd: 1 },
      { clip: old, timelineStart: 1, timelineEnd: 2 },
    ]);
  });

  it("uses the trimmed source interval on the timeline", () => {
    const trimmed = { ...clip("clip", 3, 6), trimStart: 1, trimEnd: 5 };
    expect(deriveClipRegions([trimmed])).toEqual([
      { clip: trimmed, timelineStart: 4, timelineEnd: 8 },
    ]);
  });
});

function clip(id: string, timelineOffset: number, duration: number): AudioClip {
  return {
    id,
    name: id,
    muted: false,
    soloed: false,
    timelineOffset,
    duration,
    trimStart: 0,
    trimEnd: duration,
  };
}
