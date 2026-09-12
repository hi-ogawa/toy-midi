import type { AudioTrackState } from "./runtime.ts";
import type { TakeRegion } from "./take.ts";

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

export function getTakeSources(
  regions: readonly TakeRegion[],
): AudioPlaybackSource[] {
  return regions.flatMap(({ take, timelineStart, timelineEnd }) =>
    take.buffer
      ? [
          {
            buffer: take.buffer,
            timelineOffset: take.timelineOffset,
            timelineStart,
            timelineEnd,
          },
        ]
      : [],
  );
}
