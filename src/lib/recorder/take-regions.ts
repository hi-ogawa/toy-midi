import type { TakeRegion, TakeState } from "./take.ts";

/** Resolves overlapping takes so later array entries win their timeline range. */
export function deriveTakeRegions(takes: readonly TakeState[]): TakeRegion[] {
  let regions: TakeRegion[] = [];

  // Apply takes oldest to newest. Each new take subtracts its interval from
  // every existing region before being inserted as the winning region.
  for (const take of takes) {
    if (take.trimEnd <= take.trimStart) {
      continue;
    }
    const takeStart = take.timelineOffset + take.trimStart;
    const takeEnd = take.timelineOffset + take.trimEnd;
    const nextRegions: TakeRegion[] = [];
    for (const region of regions) {
      // no overlap
      // [--region--] [---take---]  (or reversed)
      if (region.timelineEnd <= takeStart || takeEnd <= region.timelineStart) {
        // Half-open intervals that only touch at an edge do not overlap.
        nextRegions.push(region);
        continue;
      }
      // [--region--]
      //     [---take---]
      // or
      // [------region-------]
      //     [---take---]
      if (region.timelineStart < takeStart) {
        // Preserve the older region before the new take starts.
        nextRegions.push({
          ...region,
          timelineEnd: takeStart,
        });
      }
      //         [--region--]
      //     [---take---]
      // or
      // [------region------]
      //     [---take---]
      if (takeEnd < region.timelineEnd) {
        // Preserve the older timeline slice after the new take.
        nextRegions.push({
          ...region,
          timelineStart: takeEnd,
        });
      }
      // otherwise region gets covered fully and disappears
      //    [--region--]
      // [------take------]
    }
    // The complete new take wins its own interval because all overlaps have
    // already been removed from older regions.
    nextRegions.push({
      takeId: take.id,
      timelineStart: takeStart,
      timelineEnd: takeEnd,
    });
    regions = nextRegions;
  }

  return regions.sort((a, b) => a.timelineStart - b.timelineStart);
}
