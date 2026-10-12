import { describe, expect, it } from "vitest";
import type { SerializedEditorRuntimeState } from "./persistence";
import { decodeSharedProject, encodeSharedProject } from "./project-share";

describe("project share", () => {
  it("round-trips a project without its audio and reference video", async () => {
    const project: SerializedEditorRuntimeState = {
      title: "Riff",
      tempo: 98,
      timeSignature: { numerator: 6, denominator: 8 },
      audioTracks: [
        {
          id: "audio",
          height: 72,
          gain: 1,
          muted: false,
          soloed: false,
          clips: [
            {
              timelineOffset: 0,
              pcm: { sampleRate: 48000, channels: [new Float32Array(48000)] },
            },
          ],
        },
      ],
      midiTracks: [
        {
          id: "bass",
          name: "Bass",
          program: 33,
          eq: { bypass: false, bands: [] },
          height: 300,
          gain: 0.5,
          pan: -0.25,
          muted: false,
          soloed: false,
          notes: [{ id: "a", pitch: 33, start: 0, duration: 1, velocity: 100 }],
        },
      ],
      referenceVideo: {
        videoId: "knp40WxQgOI",
        timelineStart: 0,
        muted: true,
        duration: 60,
      },
    };

    const payload = await encodeSharedProject(project);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(payload.length).toBeLessThan(400);

    const { audioTracks, referenceVideo, ...rest } = project;
    expect(await decodeSharedProject(payload)).toEqual({
      ...rest,
      audioTracks: [],
    });
  });

  it("rejects a payload that is not a project", async () => {
    await expect(decodeSharedProject("not-a-project")).rejects.toThrow(
      "The share link does not hold a readable project.",
    );
  });
});
