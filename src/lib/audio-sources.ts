import type { ClipRegion } from "./audio-clip.ts";

/** A buffer slice placed on the timeline, with all times in seconds. */
export interface AudioPlaybackSource {
  buffer: AudioBuffer;
  /** Timeline position corresponding to buffer time zero. */
  timelineOffset: number;
  timelineStart: number;
  timelineEnd: number;
}

export function getClipSources(
  regions: readonly ClipRegion[],
): AudioPlaybackSource[] {
  return regions.flatMap(({ clip, timelineStart, timelineEnd }) =>
    clip.buffer
      ? [
          {
            buffer: clip.buffer,
            timelineOffset: clip.timelineOffset,
            timelineStart,
            timelineEnd,
          },
        ]
      : [],
  );
}
