export interface TakeRange {
  id: string;
  timelineOffset: number;
  duration: number;
}

export interface TakeRegion {
  takeId: string;
  timelineOffset: number;
  sourceOffset: number;
  duration: number;
}

/** Resolves overlapping takes so later array entries win their timeline range. */
export function deriveTakeRegions(takes: readonly TakeRange[]): TakeRegion[] {
  let regions: TakeRegion[] = [];

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
        nextRegions.push(region);
        continue;
      }
      if (region.timelineOffset < take.timelineOffset) {
        nextRegions.push({
          ...region,
          duration: take.timelineOffset - region.timelineOffset,
        });
      }
      if (regionEnd > takeEnd) {
        nextRegions.push({
          ...region,
          timelineOffset: takeEnd,
          sourceOffset: region.sourceOffset + takeEnd - region.timelineOffset,
          duration: regionEnd - takeEnd,
        });
      }
    }
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
