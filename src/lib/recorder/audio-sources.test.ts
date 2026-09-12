import { expect, it } from "vitest";
import type { AudioClip } from "./audio-clip.ts";
import { getAudioTrackSources } from "./audio-sources.ts";

it("resolves imported and recorded clips with the same trimmed comp precedence", () => {
  const imported = clip({
    id: "import",
    name: "backing.wav",
    timelineOffset: -1,
    trimStart: 1,
    trimEnd: 9,
  });
  const recorded = clip({
    id: "recorded",
    number: 2,
    timelineOffset: 2,
    trimStart: 1,
    trimEnd: 3,
  });
  expect(getAudioTrackSources({ clips: [imported, recorded] })).toEqual([
    {
      buffer: imported.buffer,
      timelineOffset: -1,
      timelineStart: 0,
      timelineEnd: 3,
    },
    {
      buffer: recorded.buffer,
      timelineOffset: 2,
      timelineStart: 3,
      timelineEnd: 5,
    },
    {
      buffer: imported.buffer,
      timelineOffset: -1,
      timelineStart: 5,
      timelineEnd: 8,
    },
  ]);
});

it("applies clip mute and solo within each track", () => {
  const imported = clip({ id: "import", soloed: true });
  const recorded = clip({ id: "recorded" });
  expect(
    getAudioTrackSources({ clips: [imported, recorded] }).map(
      (source) => source.buffer,
    ),
  ).toEqual([imported.buffer]);
  expect(
    getAudioTrackSources({ clips: [{ ...imported, muted: true }, recorded] }),
  ).toEqual([]);
  expect(
    getAudioTrackSources({ clips: [recorded] }).map((source) => source.buffer),
  ).toEqual([recorded.buffer]);
});

function clip(update: Partial<AudioClip> & Pick<AudioClip, "id">): AudioClip {
  return {
    muted: false,
    soloed: false,
    timelineOffset: 0,
    trimStart: 0,
    trimEnd: 10,
    duration: 10,
    buffer: { duration: 10 } as AudioBuffer,
    ...update,
  };
}
