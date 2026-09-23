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

function legacyProject(): SerializedRecorderRuntimeState {
  const pcm = {
    sampleRate: 8000,
    channels: [new Float32Array(32000).fill(0.25)],
  };
  return {
    title: "Legacy",
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

describe("recorder persistence migration", () => {
  it("preserves every legacy channel, mix setting, trim, take number and comp precedence", () => {
    const project = legacyProject();
    const state = deserializeRecorderRuntimeState({ context, project });
    const [backing, capture] = state.audioTracks;
    expect(state.armedTrackId).toBe(capture.id);
    expect(backing).toMatchObject({
      id: "backing",
      gain: 0.4,
      soloed: true,
      height: 100,
    });
    expect(backing.clips[0]).toMatchObject({
      name: "Stereo",
      timelineOffset: -1,
      trimStart: 0.5,
      trimEnd: 3,
    });
    expect(capture).toMatchObject({
      gain: 0.8,
      muted: true,
      nextTakeNumber: 9,
      height: 120,
      eq: { bands: [project.recordingTrack!.eq] },
    });
    expect(capture.clips.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: "old", name: "Take 7" },
      { id: "new", name: "Take 8" },
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
    const saved = serializeRecorderRuntimeState(state);
    expect(saved.recordingTrack).toBeUndefined();
    expect(
      saved.audioTracks.every(
        (track) =>
          track.clip === undefined && track.timelineOffset === undefined,
      ),
    ).toBe(true);
    expect(saved.audioTracks[0].clips![0].pcm).toEqual(
      project.audioTracks[0].clip!.pcm,
    );
    expect(saved.audioTracks[0].clips![0].pcm.channels[0]).not.toBe(
      project.audioTracks[0].clip!.pcm.channels[0],
    );
    expect(
      serializeRecorderRuntimeState(
        deserializeRecorderRuntimeState({ context, project: saved }),
      ),
    ).toEqual(saved);
  });

  it("defaults old empty tracks and missing take metadata without dropping audio", () => {
    const project = legacyProject();
    project.audioTracks.push({
      id: "empty",
      height: 72,
      gain: 1,
      muted: false,
      soloed: false,
    });
    delete project.recordingTrack!.nextTakeNumber;
    delete project.recordingTrack!.takes[0].id;
    delete project.recordingTrack!.takes[0].trimEnd;
    const state = deserializeRecorderRuntimeState({ context, project });
    expect(state.audioTracks[1].clips).toEqual([]);
    expect(state.audioTracks[2].nextTakeNumber).toBe(3);
    expect(state.audioTracks[2].clips[0]).toMatchObject({
      id: expect.any(String),
      trimEnd: 4,
    });
    expect(state.midiTracks).toEqual([]);
  });

  it("round-trips multiple clips on any track and an armed imported track through the archive", async () => {
    const state = deserializeRecorderRuntimeState({
      context,
      project: legacyProject(),
    });
    state.armedTrackId = state.audioTracks[0].id;
    state.audioTracks[0].clips.push({
      ...state.audioTracks[1].clips[0],
      id: "added",
      muted: true,
      soloed: true,
    });
    state.midiTracks.push({
      id: "midi",
      name: "MIDI 1",
      notes: [],
      program: 33,
      height: 300,
      viewMode: "overview",
      gain: 0.6,
      muted: false,
      soloed: true,
      tabAnnotationEnabled: true,
      tabOpenStringPitches: [28, 33, 38, 43],
      keySignature: { fifths: 2, mode: "minor" },
      eq: state.audioTracks[0].eq,
    });
    const saved = serializeRecorderRuntimeState(state);
    const archive = await exportRecorderProjectArchive(saved);
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());
    const restored = await readRecorderProjectArchive(zip);
    expect(restored).toEqual(saved);
    expect(
      serializeRecorderRuntimeState(
        deserializeRecorderRuntimeState({ context, project: restored }),
      ),
    ).toEqual(saved);
  });

  it("reads old archive PCM paths before converting the separate tracks", async () => {
    const project = legacyProject();
    const archive = await exportRecorderProjectArchive(project);
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());
    expect(zip.file("audio/tracks/0/channel-1.f32")).not.toBeNull();
    expect(zip.file("audio/takes/1/channel-0.f32")).not.toBeNull();
    const restored = await readRecorderProjectArchive(zip);
    expect(restored).toEqual(project);
    const saved = serializeRecorderRuntimeState(
      deserializeRecorderRuntimeState({ context, project: restored }),
    );
    expect(saved.audioTracks.map((track) => track.clips!.length)).toEqual([
      1, 2,
    ]);
  });
});
