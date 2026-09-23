import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type {
  RecorderPcm,
  SerializedRecorderRuntimeState,
} from "./persistence";
import {
  exportRecorderProjectArchive,
  readRecorderProjectArchive,
} from "./project-archive";

describe("recorder project archive", () => {
  it("stores each clip's PCM by track and clip index and reads it back", async () => {
    const project = createProject({
      audioTracks: [
        createTrack({
          clips: [
            { timelineOffset: 0, pcm: createPcm({ channelCount: 2 }) },
            { timelineOffset: 1, pcm: createPcm({ channelCount: 1 }) },
          ],
        }),
      ],
    });
    const zip = await exportAndLoad(project);
    expect(listPcmPaths(zip)).toEqual([
      "audio/tracks/0/clips/0/channel-0.f32",
      "audio/tracks/0/clips/0/channel-1.f32",
      "audio/tracks/0/clips/1/channel-0.f32",
    ]);
    expect(await readRecorderProjectArchive(zip)).toEqual(project);
  });

  it("reads single-clip track and separate take PCM paths", async () => {
    const project = createProject({
      audioTracks: [
        createTrack({
          timelineOffset: 0,
          clip: { name: "Backing", pcm: createPcm({ channelCount: 1 }) },
        }),
      ],
    });
    project.recordingTrack.takes = [
      { timelineOffset: 0, pcm: createPcm({ channelCount: 1 }) },
    ];
    const zip = await exportAndLoad(project);
    expect(listPcmPaths(zip)).toEqual([
      "audio/takes/0/channel-0.f32",
      "audio/tracks/0/channel-0.f32",
    ]);
    expect(await readRecorderProjectArchive(zip)).toEqual(project);
  });
});

async function exportAndLoad(project: SerializedRecorderRuntimeState) {
  const archive = await exportRecorderProjectArchive(project);
  return JSZip.loadAsync(await archive.arrayBuffer());
}

function listPcmPaths(zip: JSZip) {
  return Object.keys(zip.files)
    .filter((path) => path.endsWith(".f32"))
    .sort();
}

function createProject({
  audioTracks,
}: {
  audioTracks: SerializedRecorderRuntimeState["audioTracks"];
}): SerializedRecorderRuntimeState {
  return {
    title: "Project",
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    audioTracks,
    recordingTrack: {
      height: 116,
      gain: 1,
      muted: false,
      soloed: false,
      takes: [],
    },
  };
}

function createTrack(
  fields: Partial<SerializedRecorderRuntimeState["audioTracks"][number]>,
): SerializedRecorderRuntimeState["audioTracks"][number] {
  return {
    id: crypto.randomUUID(),
    height: 72,
    gain: 1,
    muted: false,
    soloed: false,
    ...fields,
  };
}

function createPcm({
  channelCount,
}: {
  channelCount: number;
}): RecorderPcm<Float32Array> {
  return {
    sampleRate: 8000,
    channels: Array.from({ length: channelCount }, (_, channel) =>
      Float32Array.of(channel, 0.25, -0.5),
    ),
  };
}
