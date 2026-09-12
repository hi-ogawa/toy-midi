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
