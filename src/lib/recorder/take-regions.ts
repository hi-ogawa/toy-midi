import type { TakeRegion, TakeState } from "./take.ts";

/** Resolves overlapping takes so later array entries win their timeline range. */
export function deriveTakeRegions(takes: readonly TakeState[]): TakeRegion[] {
  let regions: TakeRegion[] = [];

  // Apply takes oldest to newest. Each new take subtracts its interval from
  // every existing region before being inserted as the winning region.
  for (const take of takes) {
    if (take.duration <= 0) {
      continue;
    }
    const takeEnd = take.timelineOffset + take.duration;
    const nextRegions: TakeRegion[] = [];
    for (const region of regions) {
      const regionEnd = region.timelineOffset + region.duration;
      // no overlap
      // [--region--] [---take---]  (or reversed)
      if (
        regionEnd <= take.timelineOffset ||
        takeEnd <= region.timelineOffset
      ) {
        // Half-open intervals that only touch at an edge do not overlap.
        nextRegions.push(region);
        continue;
      }
      // [--region--]
      //     [---take---]
      // or
      // [------region-------]
      //     [---take---]
      if (region.timelineOffset < take.timelineOffset) {
        // Preserve the older region before the new take starts.
        nextRegions.push({
          ...region,
          duration: take.timelineOffset - region.timelineOffset,
        });
      }
      //         [--region--]
      //     [---take---]
      // or
      // [------region------]
      //     [---take---]
      if (takeEnd < regionEnd) {
        // Preserve the older region after the new take. Advance sourceOffset by
        // the removed timeline span so it still addresses the same source audio.
        nextRegions.push({
          ...region,
          timelineOffset: takeEnd,
          sourceOffset: region.sourceOffset + takeEnd - region.timelineOffset,
          duration: regionEnd - takeEnd,
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
      timelineOffset: take.timelineOffset,
      sourceOffset: 0,
      duration: take.duration,
    });
    regions = nextRegions.sort((a, b) => a.timelineOffset - b.timelineOffset);
  }

  return regions;
}
