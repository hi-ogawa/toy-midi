import { describe, expect, it, vi } from "vitest";
import {
  deserializeRecorderRuntimeState,
  serializeRecorderRuntimeState,
  type SerializedRecorderRuntimeState,
} from "./persistence";

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
    expect(state.audioTracks[0].clips).toMatchObject([
      {
        name: "Stereo",
        gain: 0.5,
        timelineOffset: -1,
        trimStart: 0.5,
        trimEnd: 3,
        duration: 4,
      },
    ]);

    const [saved] = serializeRecorderRuntimeState(state).audioTracks;
    expect(saved).not.toHaveProperty("clip");
    expect(saved).not.toHaveProperty("timelineOffset");
    expect(saved.clips).toEqual([
      {
        id: state.audioTracks[0].clips[0].id,
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
    expect(saved.audioTracks[0].clips).toEqual(clips);
    expect(saved.audioTracks[0].clips![0].pcm.channels[0]).not.toBe(
      clips[0].pcm.channels[0],
    );
    expect(
      serializeRecorderRuntimeState(
        deserializeRecorderRuntimeState({ context, project: saved }),
      ),
    ).toEqual(saved);
  });
});

function createProject({
  audioTracks,
}: {
  audioTracks: SerializedTrack[];
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
