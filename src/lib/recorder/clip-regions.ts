import type { ClipRegion, AudioClip } from "./audio-clip.ts";

/** Resolves overlapping clips so later array entries win their timeline range. */
export function deriveClipRegions(clips: readonly AudioClip[]): ClipRegion[] {
  let regions: ClipRegion[] = [];

  // Apply clips oldest to newest. Each new clip subtracts its interval from
  // every existing region before being inserted as the winning region.
  for (const clip of clips) {
    if (clip.trimEnd <= clip.trimStart) {
      continue;
    }
    const clipStart = clip.timelineOffset + clip.trimStart;
    const clipEnd = clip.timelineOffset + clip.trimEnd;
    const nextRegions: ClipRegion[] = [];
    for (const region of regions) {
      // no overlap
      // [--region--] [---clip---]  (or reversed)
      if (region.timelineEnd <= clipStart || clipEnd <= region.timelineStart) {
        // Half-open intervals that only touch at an edge do not overlap.
        nextRegions.push(region);
        continue;
      }
      // [--region--]
      //     [---clip---]
      // or
      // [------region-------]
      //     [---clip---]
      if (region.timelineStart < clipStart) {
        // Preserve the older region before the new clip starts.
        nextRegions.push({
          ...region,
          timelineEnd: clipStart,
        });
      }
      //         [--region--]
      //     [---clip---]
      // or
      // [------region------]
      //     [---clip---]
      if (clipEnd < region.timelineEnd) {
        // Preserve the older timeline slice after the new clip.
        nextRegions.push({
          ...region,
          timelineStart: clipEnd,
        });
      }
      // otherwise region gets covered fully and disappears
      //    [--region--]
      // [------clip------]
    }
    // The complete new clip wins its own interval because all overlaps have
    // already been removed from older regions.
    nextRegions.push({
      clip,
      timelineStart: clipStart,
      timelineEnd: clipEnd,
    });
    regions = nextRegions;
  }

  return regions.sort((a, b) => a.timelineStart - b.timelineStart);
}

export function getActiveClips(clips: readonly AudioClip[]): AudioClip[] {
  const anyClipSoloed = clips.some((clip) => clip.soloed);
  return clips.filter((clip) => !clip.muted && (!anyClipSoloed || clip.soloed));
}
