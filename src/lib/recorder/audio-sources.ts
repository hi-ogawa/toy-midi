import type { TakeRegion } from "./audio-clip.ts";
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
  const clip = track.clips[0];
  return clip?.buffer
    ? [
        {
          buffer: clip.buffer,
          timelineOffset: clip.timelineOffset,
          timelineStart: clip.timelineOffset + clip.trimStart,
          timelineEnd: clip.timelineOffset + clip.trimEnd,
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
