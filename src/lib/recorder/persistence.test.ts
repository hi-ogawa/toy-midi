import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { deriveClipRegions } from "./clip-regions";
import {
  deserializeRecorderRuntimeState,
  serializeRecorderRuntimeState,
  type SerializedRecorderRuntimeState,
} from "./persistence";
import {
  exportRecorderProjectArchive,
  readRecorderProjectArchive,
} from "./project-archive";
import { RECORDING_TRACK_ID } from "./recording-track";

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

// A project saved with single-clip tracks and a separate recording track.
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
      eq: { frequency: 300, gain: 2, q: 1, bypass: false },
      takes: [
        {
          id: "old",
          number: 7,
          gain: 0.5,
          timelineOffset: 1,
          trimStart: 0.25,
          trimEnd: 3,
          pcm,
        },
        {
          id: "new",
          number: 8,
          timelineOffset: 2,
          trimStart: 0,
          trimEnd: 1,
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
    const backing = state.audioTracks[1];
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

    const saved = serializeRecorderRuntimeState(state);
    expect(saved.audioTracks[1]).not.toHaveProperty("clip");
    expect(saved.audioTracks[1]).not.toHaveProperty("timelineOffset");
    expect(saved.audioTracks[1].clips).toMatchObject([
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
    expect(saved.audioTracks[1].clips![0].pcm.channels[0]).not.toBe(
      project.audioTracks[0].clip!.pcm.channels[0],
    );
    expect(
      serializeRecorderRuntimeState(
        deserializeRecorderRuntimeState({ context, project: saved }),
      ),
    ).toEqual(saved);
  });

  it("folds the separate recording track into audioTracks without losing takes", () => {
    const project = singleClipProject();
    const state = deserializeRecorderRuntimeState({ context, project });
    const [capture] = state.audioTracks;
    expect(capture).toMatchObject({
      id: RECORDING_TRACK_ID,
      gain: 0.8,
      muted: true,
      soloed: false,
      nextTakeNumber: 9,
      height: 120,
      eq: { bands: [project.recordingTrack!.eq] },
    });
    expect(
      capture.clips.map(({ id, name, gain }) => ({ id, name, gain })),
    ).toEqual([
      { id: "old", name: "Take 7", gain: 0.5 },
      { id: "new", name: "Take 8", gain: 1 },
    ]);
    expect(
      deriveClipRegions(capture.clips).map(
        ({ clip, timelineStart, timelineEnd }) => [
          clip.id,
          timelineStart,
          timelineEnd,
        ],
      ),
    ).toEqual([
      ["old", 1.25, 2],
      ["new", 2, 3],
      ["old", 3, 4],
    ]);

    // Resave the Capture track inside audioTracks with its fixed id.
    const saved = serializeRecorderRuntimeState(state);
    expect(saved).not.toHaveProperty("recordingTrack");
    expect(saved.audioTracks[0]).toMatchObject({
      id: RECORDING_TRACK_ID,
      nextTakeNumber: 9,
      height: 120,
      clips: [
        {
          id: "old",
          name: "Take 7",
          pcm: project.recordingTrack!.takes[0].pcm,
        },
        { id: "new", name: "Take 8" },
      ],
    });
    expect(
      serializeRecorderRuntimeState(
        deserializeRecorderRuntimeState({ context, project: saved }),
      ),
    ).toEqual(saved);
  });

  it("defaults missing take numbering and ids in the separate recording track", () => {
    const project = singleClipProject();
    delete project.recordingTrack!.nextTakeNumber;
    delete project.recordingTrack!.takes[0].id;
    delete project.recordingTrack!.takes[1].number;
    const state = deserializeRecorderRuntimeState({ context, project });
    expect(state.audioTracks[0]).toMatchObject({
      id: RECORDING_TRACK_ID,
      nextTakeNumber: 3,
      clips: [{ id: expect.any(String), name: "Take 7" }, { name: "Take 2" }],
    });
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
    expect(state.audioTracks[1].clips[0].trimEnd).toBe(4);
    expect(state.audioTracks[2]).toMatchObject({
      nextTakeNumber: 1,
      clips: [],
    });
    expect(serializeRecorderRuntimeState(state).audioTracks[2].clips).toEqual(
      [],
    );
  });

  it("round-trips a multi-clip track through the archive", async () => {
    const state = deserializeRecorderRuntimeState({
      context,
      project: singleClipProject(),
    });
    state.audioTracks[1].clips.push({
      ...state.audioTracks[0].clips[0],
      id: "added",
      name: "Added",
      gain: 0.25,
      muted: true,
      soloed: true,
    });
    const saved = serializeRecorderRuntimeState(state);
    expect(saved.audioTracks[1].clips).toMatchObject([
      { name: "Stereo", gain: 0.5 },
      { id: "added", name: "Added", gain: 0.25, muted: true, soloed: true },
    ]);

    const archive = await exportRecorderProjectArchive(saved);
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());
    expect(zip.file("audio/tracks/0/clips/1/channel-0.f32")).not.toBeNull();
    expect(zip.file("audio/tracks/1/clips/0/channel-1.f32")).not.toBeNull();
    expect(zip.file("audio/tracks/1/clips/1/channel-0.f32")).not.toBeNull();
    const restored = await readRecorderProjectArchive(zip);
    expect(restored).toEqual(saved);
    expect(
      serializeRecorderRuntimeState(
        deserializeRecorderRuntimeState({ context, project: restored }),
      ),
    ).toEqual(saved);
  });

  it("reads single-clip and separate take archive PCM paths", async () => {
    const project = singleClipProject();
    const archive = await exportRecorderProjectArchive(project);
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());
    expect(zip.file("audio/tracks/0/channel-1.f32")).not.toBeNull();
    expect(zip.file("audio/takes/1/channel-0.f32")).not.toBeNull();
    const restored = await readRecorderProjectArchive(zip);
    expect(restored).toEqual(project);
    const state = deserializeRecorderRuntimeState({
      context,
      project: restored,
    });
    expect(state.audioTracks.map((track) => track.clips.length)).toEqual([
      2, 1,
    ]);
    expect(state.audioTracks[1].clips).toMatchObject([
      { name: "Stereo", gain: 0.5, timelineOffset: -1 },
    ]);
  });
});
