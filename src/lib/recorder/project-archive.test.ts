import JSZip from "jszip";
import { describe, expect, test } from "vitest";
import type { SerializedRecorderRuntimeState } from "./persistence.ts";
import {
  exportRecorderProjectArchive,
  parseRecorderProjectArchive,
} from "./project-archive.ts";

describe("recorder project file", () => {
  test("stores PCM as binary entries and restores typed arrays", async () => {
    const content = createProjectContent();
    const blob = await exportRecorderProjectArchive(content);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const project = JSON.parse(
      await zip.file("project.json")!.async("text"),
    ) as {
      audioTracks: Array<{ clip: { pcm: { channels: string[] } } }>;
    };

    expect(project.audioTracks[0]!.clip.pcm.channels).toEqual([
      "audio/tracks/0/channel-0.f32",
      "audio/tracks/0/channel-1.f32",
    ]);
    expect(
      await zip.file("audio/tracks/0/channel-0.f32")!.async("uint8array"),
    ).toHaveLength(3 * Float32Array.BYTES_PER_ELEMENT);

    const parsed = await parseRecorderProjectArchive(
      createTestFile(await blob.arrayBuffer()),
    );
    expect(parsed.content.audioTracks[0]!.clip!.pcm.channels).toEqual([
      content.audioTracks[0]!.clip!.pcm.channels[0],
      content.audioTracks[0]!.clip!.pcm.channels[1],
    ]);
    expect(parsed.content.recordingTrack.takes[0]!.pcm.channels[0]).toEqual(
      content.recordingTrack.takes[0]!.pcm.channels[0],
    );
  });

  test("rejects a missing PCM entry", async () => {
    const file = await modifyArchive(async (zip, project) => {
      project.audioTracks[0].clip.pcm.channels[0] =
        "audio/tracks/0/missing.f32";
      zip.file("project.json", JSON.stringify(project));
    });

    await expect(parseRecorderProjectArchive(file)).rejects.toThrow(
      "Recorder project archive is missing audio/tracks/0/missing.f32.",
    );
  });

  test("rejects malformed binary PCM", async () => {
    const file = await modifyArchive(async (zip, project) => {
      const path = project.audioTracks[0].clip.pcm.channels[0];
      zip.file(path, new Uint8Array([1, 2, 3]));
    });

    await expect(parseRecorderProjectArchive(file)).rejects.toThrow(
      "Recorder project archive has invalid audio data.",
    );
  });

  test("rejects channels with unequal frame counts", async () => {
    const file = await modifyArchive(async (zip, project) => {
      const path = project.audioTracks[0].clip.pcm.channels[1];
      zip.file(path, new Uint8Array(new Float32Array([1, 2]).buffer));
    });

    await expect(parseRecorderProjectArchive(file)).rejects.toThrow(
      "Recorder project archive has invalid audio data.",
    );
  });
});

async function modifyArchive(
  modify: (zip: JSZip, project: any) => Promise<void>,
): Promise<File> {
  const zip = await JSZip.loadAsync(
    await (
      await exportRecorderProjectArchive(createProjectContent())
    ).arrayBuffer(),
  );
  const project = JSON.parse(await zip.file("project.json")!.async("text"));
  await modify(zip, project);
  return createTestFile(
    await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" }),
  );
}

function createTestFile(buffer: ArrayBuffer): File {
  Object.defineProperty(buffer, "name", { value: "project.toymidi" });
  return buffer as ArrayBuffer & File;
}

function createProjectContent(): SerializedRecorderRuntimeState {
  return {
    title: "Archive test",
    audioTracks: [
      {
        id: "track-1",
        height: 100,
        clip: {
          name: "backing.wav",
          pcm: {
            sampleRate: 48_000,
            channels: [
              new Float32Array([0.1, 0.2, 0.3]),
              new Float32Array([-0.1, -0.2, -0.3]),
            ],
          },
        },
        gain: 1,
        muted: false,
        soloed: false,
        timelineOffset: 0,
      },
    ],
    recordingTrack: {
      height: 100,
      gain: 1,
      muted: false,
      soloed: false,
      takes: [
        {
          id: "take-1",
          number: 1,
          timelineOffset: 0,
          pcm: {
            sampleRate: 48_000,
            channels: [new Float32Array([0.4, 0.5, 0.6])],
          },
        },
      ],
    },
    latencyCompensation: 0,
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
  };
}
