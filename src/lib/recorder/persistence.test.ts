import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import {
  deserializeRecorderRuntimeState,
  serializeRecorderRuntimeState,
  type SerializedRecorderRuntimeState,
} from "./persistence";
import {
  exportRecorderProjectArchive,
  readRecorderProjectArchive,
} from "./project-archive";

vi.hoisted(() => {
  vi.stubGlobal("AudioWorkletNode", class {});
});

const context = {
  createBuffer(count: number, length: number, sampleRate: number): AudioBuffer {
    const channels = Array.from(
      { length: count },
      () => new Float32Array(length),
    );
    return {
      sampleRate,
      length,
      numberOfChannels: count,
      duration: length / sampleRate,
      getChannelData: (channel: number) => channels[channel],
    } as AudioBuffer;
  },
};

function singleClipProject(): SerializedRecorderRuntimeState {
  const pcm = {
    sampleRate: 8000,
    channels: [new Float32Array(32000).fill(0.25)],
  };
  return {
    title: "Single clip",
    tempo: 90,
    timeSignature: { numerator: 3, denominator: 4 },
    audioTracks: [
      {
        id: "backing",
        height: 100,
        gain: 0.4,
        muted: false,
        soloed: true,
        timelineOffset: -1,
        trimStart: 0.5,
        trimEnd: 3,
        clip: {
          name: "Stereo",
          gain: 0.5,
          pcm: {
            ...pcm,
            channels: [...pcm.channels, new Float32Array(32000).fill(-0.5)],
          },
        },
      },
    ],
    recordingTrack: {
      height: 120,
      gain: 0.8,
      muted: true,
      soloed: false,
      nextTakeNumber: 9,
      takes: [
        {
          id: "take",
          number: 8,
          timelineOffset: 1,
          trimStart: 0.25,
          trimEnd: 3,
          pcm,
        },
      ],
    },
  };
}

describe("recorder persistence", () => {
  it("loads a single-clip track and saves it as a clip array", () => {
    const project = singleClipProject();
    const state = deserializeRecorderRuntimeState({ context, project });
    const [backing] = state.audioTracks;
    expect(backing).toMatchObject({
      id: "backing",
      gain: 0.4,
      soloed: true,
      height: 100,
    });
    expect(backing.clips).toHaveLength(1);
    expect(backing.clips[0]).toMatchObject({
      name: "Stereo",
      gain: 0.5,
      timelineOffset: -1,
      trimStart: 0.5,
      trimEnd: 3,
    });
    expect(state.recordingTrack.clips[0]).toMatchObject({
      id: "take",
      name: "Take 8",
    });

    const saved = serializeRecorderRuntimeState(state);
    expect(saved.audioTracks[0]).not.toHaveProperty("clip");
    expect(saved.audioTracks[0]).not.toHaveProperty("timelineOffset");
    expect(saved.audioTracks[0].clips).toMatchObject([
      {
        id: backing.clips[0].id,
        name: "Stereo",
        gain: 0.5,
        timelineOffset: -1,
        trimStart: 0.5,
        trimEnd: 3,
        pcm: project.audioTracks[0].clip!.pcm,
      },
    ]);
    expect(saved.audioTracks[0].clips![0].pcm.channels[0]).not.toBe(
      project.audioTracks[0].clip!.pcm.channels[0],
    );
    expect(
      serializeRecorderRuntimeState(
        deserializeRecorderRuntimeState({ context, project: saved }),
      ),
    ).toEqual(saved);
  });

  it("defaults an empty single-clip track and missing clip timing", () => {
    const project = singleClipProject();
    delete project.audioTracks[0].trimEnd;
    project.audioTracks.push({
      id: "empty",
      height: 72,
      gain: 1,
      muted: false,
      soloed: false,
    });
    const state = deserializeRecorderRuntimeState({ context, project });
    expect(state.audioTracks[0].clips[0].trimEnd).toBe(4);
    expect(state.audioTracks[1].clips).toEqual([]);
    expect(serializeRecorderRuntimeState(state).audioTracks[1].clips).toEqual(
      [],
    );
  });

  it("round-trips a multi-clip track through the archive", async () => {
    const state = deserializeRecorderRuntimeState({
      context,
      project: singleClipProject(),
    });
    state.audioTracks[0].clips.push({
      ...state.recordingTrack.clips[0],
      id: "added",
      name: "Added",
      gain: 0.25,
      muted: true,
      soloed: true,
    });
    const saved = serializeRecorderRuntimeState(state);
    expect(saved.audioTracks[0].clips).toMatchObject([
      { name: "Stereo", gain: 0.5 },
      { id: "added", name: "Added", gain: 0.25, muted: true, soloed: true },
    ]);

    const archive = await exportRecorderProjectArchive(saved);
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());
    expect(zip.file("audio/tracks/0/clips/0/channel-1.f32")).not.toBeNull();
    expect(zip.file("audio/tracks/0/clips/1/channel-0.f32")).not.toBeNull();
    const restored = await readRecorderProjectArchive(zip);
    expect(restored).toEqual(saved);
    expect(
      serializeRecorderRuntimeState(
        deserializeRecorderRuntimeState({ context, project: restored }),
      ),
    ).toEqual(saved);
  });

  it("reads single-clip archive PCM paths", async () => {
    const project = singleClipProject();
    const archive = await exportRecorderProjectArchive(project);
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());
    expect(zip.file("audio/tracks/0/channel-1.f32")).not.toBeNull();
    const restored = await readRecorderProjectArchive(zip);
    expect(restored).toEqual(project);
    const state = deserializeRecorderRuntimeState({
      context,
      project: restored,
    });
    expect(state.audioTracks[0].clips).toMatchObject([
      { name: "Stereo", gain: 0.5, timelineOffset: -1 },
    ]);
  });
});
