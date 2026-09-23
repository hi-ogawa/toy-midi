import { describe, expect, it, vi } from "vitest";
import {
  deserializeRecorderRuntimeState,
  serializeRecorderRuntimeState,
  type SerializedRecorderRuntimeState,
} from "./persistence";
import { RECORDING_TRACK_ID } from "./recording-track";

// Persistence reads EQ defaults from a module that subclasses AudioWorkletNode.
vi.hoisted(() => {
  vi.stubGlobal("AudioWorkletNode", class {});
});

type SerializedTrack = SerializedRecorderRuntimeState["audioTracks"][number];

const SAMPLE_RATE = 8000;

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

describe("recorder persistence", () => {
  it("loads a single-clip track and resaves it as a clip array", () => {
    const pcm = createPcm({ seconds: 4, channelCount: 2 });
    const project = createProject({
      audioTracks: [
        createTrack({
          id: "backing",
          timelineOffset: -1,
          trimStart: 0.5,
          trimEnd: 3,
          clip: { name: "Stereo", gain: 0.5, pcm },
        }),
      ],
    });
    const state = deserializeRecorderRuntimeState({ context, project });
    const backing = findTrack(state.audioTracks, "backing");
    expect(backing.clips).toMatchObject([
      {
        name: "Stereo",
        gain: 0.5,
        timelineOffset: -1,
        trimStart: 0.5,
        trimEnd: 3,
        duration: 4,
      },
    ]);

    const saved = findTrack(
      serializeRecorderRuntimeState(state).audioTracks,
      "backing",
    );
    expect(saved).not.toHaveProperty("clip");
    expect(saved).not.toHaveProperty("timelineOffset");
    expect(saved.clips).toEqual([
      {
        id: backing.clips[0].id,
        name: "Stereo",
        gain: 0.5,
        muted: false,
        soloed: false,
        timelineOffset: -1,
        trimStart: 0.5,
        trimEnd: 3,
        pcm,
      },
    ]);
  });

  it("defaults a missing trim end and loads a track without a clip", () => {
    const project = createProject({
      audioTracks: [
        createTrack({
          id: "backing",
          timelineOffset: 0,
          clip: { name: "Mono", pcm: createPcm({ seconds: 4 }) },
        }),
        createTrack({ id: "empty" }),
      ],
    });
    const state = deserializeRecorderRuntimeState({ context, project });
    expect(state.audioTracks.map((track) => track.clips)).toMatchObject([
      [{ trimStart: 0, trimEnd: 4 }],
      [],
    ]);
  });

  it("round-trips every clip on a multi-clip track", () => {
    const clips = [
      {
        id: "first",
        name: "First",
        gain: 0.5,
        muted: false,
        soloed: true,
        timelineOffset: 1,
        trimStart: 0.25,
        trimEnd: 2,
        pcm: createPcm({ seconds: 2, channelCount: 2 }),
      },
      {
        id: "second",
        name: "Second",
        gain: 1,
        muted: true,
        soloed: false,
        timelineOffset: 3,
        trimStart: 0,
        trimEnd: 1,
        pcm: createPcm({ seconds: 1 }),
      },
    ];
    const project = createProject({
      audioTracks: [createTrack({ id: "backing", clips })],
    });
    const saved = serializeRecorderRuntimeState(
      deserializeRecorderRuntimeState({ context, project }),
    );
    const savedClips = findTrack(saved.audioTracks, "backing").clips!;
    expect(savedClips).toEqual(clips);
    expect(savedClips[0].pcm.channels[0]).not.toBe(clips[0].pcm.channels[0]);
    expect(
      serializeRecorderRuntimeState(
        deserializeRecorderRuntimeState({ context, project: saved }),
      ),
    ).toEqual(saved);
  });

  it("folds a separate recording track into audioTracks as the Capture track", () => {
    const takes = [
      {
        id: "old",
        number: 7,
        gain: 0.5,
        timelineOffset: 1,
        trimStart: 0.25,
        trimEnd: 3,
        pcm: createPcm({ seconds: 4 }),
      },
      {
        id: "new",
        number: 8,
        timelineOffset: 2,
        pcm: createPcm({ seconds: 1 }),
      },
    ];
    const eq = { frequency: 300, gain: 2, q: 1, bypass: false };
    const project = createProject({
      audioTracks: [createTrack({ id: "backing" })],
      recordingTrack: {
        height: 120,
        gain: 0.8,
        muted: true,
        soloed: false,
        nextTakeNumber: 9,
        eq,
        takes,
      },
    });
    const state = deserializeRecorderRuntimeState({ context, project });
    const capture = findTrack(state.audioTracks, RECORDING_TRACK_ID);
    expect(capture).toMatchObject({
      height: 120,
      gain: 0.8,
      muted: true,
      nextTakeNumber: 9,
      eq: { bands: [eq] },
    });
    expect(capture.clips).toMatchObject([
      { id: "old", name: "Take 7", gain: 0.5, timelineOffset: 1, trimEnd: 3 },
      { id: "new", name: "Take 8", gain: 1, timelineOffset: 2, trimEnd: 1 },
    ]);

    // Resave the Capture track inside audioTracks under its fixed id.
    const saved = serializeRecorderRuntimeState(state);
    expect(saved).not.toHaveProperty("recordingTrack");
    expect(findTrack(saved.audioTracks, RECORDING_TRACK_ID)).toMatchObject({
      nextTakeNumber: 9,
      clips: [
        { id: "old", pcm: takes[0].pcm },
        { id: "new", pcm: takes[1].pcm },
      ],
    });
    expect(
      serializeRecorderRuntimeState(
        deserializeRecorderRuntimeState({ context, project: saved }),
      ),
    ).toEqual(saved);
  });

  it("defaults missing take numbering and ids in a separate recording track", () => {
    const project = createProject({
      audioTracks: [],
      recordingTrack: {
        height: 116,
        gain: 1,
        muted: false,
        soloed: false,
        takes: [
          { number: 4, timelineOffset: 0, pcm: createPcm({ seconds: 1 }) },
          {
            id: "numberless",
            timelineOffset: 1,
            pcm: createPcm({ seconds: 1 }),
          },
        ],
      },
    });
    const state = deserializeRecorderRuntimeState({ context, project });
    expect(findTrack(state.audioTracks, RECORDING_TRACK_ID)).toMatchObject({
      nextTakeNumber: 3,
      clips: [
        { id: expect.any(String), name: "Take 4" },
        { id: "numberless", name: "Take 2" },
      ],
    });
  });
});

function findTrack<T extends { id: string }>(tracks: readonly T[], id: string) {
  const track = tracks.find((track) => track.id === id);
  if (!track) {
    throw new Error(`Track ${id} is missing.`);
  }
  return track;
}

function createProject(
  content: Pick<
    SerializedRecorderRuntimeState,
    "audioTracks" | "recordingTrack"
  >,
): SerializedRecorderRuntimeState {
  return {
    title: "Project",
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    ...content,
  };
}

function createTrack(
  fields: Pick<SerializedTrack, "id"> & Partial<SerializedTrack>,
): SerializedTrack {
  return { height: 72, gain: 1, muted: false, soloed: false, ...fields };
}

function createPcm({
  seconds,
  channelCount = 1,
}: {
  seconds: number;
  channelCount?: number;
}) {
  return {
    sampleRate: SAMPLE_RATE,
    channels: Array.from({ length: channelCount }, (_, channel) =>
      new Float32Array(seconds * SAMPLE_RATE).fill(channel + 0.25),
    ),
  };
}
