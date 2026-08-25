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
      if (
        regionEnd <= take.timelineOffset ||
        region.timelineOffset >= takeEnd
      ) {
        // Half-open intervals that only touch at an edge do not overlap.
        nextRegions.push(region);
        continue;
      }
      if (region.timelineOffset < take.timelineOffset) {
        // Preserve the older region before the new take starts.
        nextRegions.push({
          ...region,
          duration: take.timelineOffset - region.timelineOffset,
        });
      }
      if (regionEnd > takeEnd) {
        // Preserve the older region after the new take. Advance sourceOffset by
        // the removed timeline span so it still addresses the same source audio.
        nextRegions.push({
          ...region,
          timelineOffset: takeEnd,
          sourceOffset: region.sourceOffset + takeEnd - region.timelineOffset,
          duration: regionEnd - takeEnd,
        });
      }
    }
    // The complete new take wins its own interval because all overlaps have
    // already been removed from older regions.
    nextRegions.push({
      takeId: take.id,
      timelineOffset: take.timelineOffset,
      sourceOffset: 0,
      duration: take.duration,
    });
    regions = mergeAdjacentRegions(
      nextRegions.sort((a, b) => a.timelineOffset - b.timelineOffset),
    );
  }

  return regions;
}

function mergeAdjacentRegions(regions: readonly TakeRegion[]): TakeRegion[] {
  const merged: TakeRegion[] = [];
  for (const region of regions) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.takeId === region.takeId &&
      // Merge only when both timeline and source coordinates are contiguous.
      previous.timelineOffset + previous.duration === region.timelineOffset &&
      previous.sourceOffset + previous.duration === region.sourceOffset
    ) {
      previous.duration += region.duration;
    } else {
      merged.push({ ...region });
    }
  }
  return merged;
}
