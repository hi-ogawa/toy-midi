import type { ClipRegion } from "./audio-clip.ts";
import type { AudioTrackState } from "./runtime.ts";

/** A buffer slice placed on the timeline, with all times in seconds. */
export interface AudioPlaybackSource {
  buffer: AudioBuffer;
  /** Timeline position corresponding to buffer time zero. */
  timelineOffset: number;
  timelineStart: number;
  timelineEnd: number;
}

export function getAudioTrackSources(
  track: AudioTrackState,
): AudioPlaybackSource[] {
  return track.clip
    ? [
        {
          buffer: track.clip.buffer,
          timelineOffset: track.timelineOffset,
          timelineStart: track.timelineOffset + track.trimStart,
          timelineEnd: track.timelineOffset + track.trimEnd,
        },
      ]
    : [];
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
