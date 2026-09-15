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

/** Render raw sources to mono, cropping pre-zero audio and returning the timeline offset in seconds. */
export async function renderAudioSources(
  sources: readonly AudioPlaybackSource[],
): Promise<{ buffer: AudioBuffer; offset: number }> {
  const audible = sources.filter(
    (source) => source.timelineEnd > Math.max(0, source.timelineStart),
  );
  if (audible.length === 0) {
    throw new Error("No audio to render.");
  }
  const offset = Math.max(
    0,
    Math.min(...audible.map((source) => source.timelineStart)),
  );
  const end = Math.max(...audible.map((source) => source.timelineEnd));
  const sampleRate = audible[0]!.buffer.sampleRate;
  const context = new OfflineAudioContext(
    1,
    Math.ceil((end - offset) * sampleRate),
    sampleRate,
  );
  for (const region of audible) {
    const start = Math.max(0, region.timelineStart);
    const source = context.createBufferSource();
    source.buffer = region.buffer;
    source.connect(context.destination);
    source.start(
      start - offset,
      start - region.timelineOffset,
      region.timelineEnd - start,
    );
  }
  const buffer = await context.startRendering();
  return { buffer, offset };
}
