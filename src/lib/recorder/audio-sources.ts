import type { ClipRegion, AudioClip } from "./audio-clip.ts";
import { deriveClipRegions, getActiveClips } from "./clip-regions.ts";

/** A buffer slice placed on the timeline, with all times in seconds. */
export interface AudioPlaybackSource {
  buffer: AudioBuffer;
  /** Timeline position corresponding to buffer time zero. */
  timelineOffset: number;
  timelineStart: number;
  timelineEnd: number;
}

export function getAudioTrackSources(track: {
  clips: readonly AudioClip[];
}): AudioPlaybackSource[] {
  return getClipSources(deriveClipRegions(getActiveClips(track.clips)));
}

function getClipSources(regions: readonly ClipRegion[]): AudioPlaybackSource[] {
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
