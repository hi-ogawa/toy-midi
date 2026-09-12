import type { AudioPlaybackSource } from "./audio-buffer-playback.ts";
import type { AudioTrackState } from "./runtime.ts";
import type { TakeRegion } from "./take.ts";

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
