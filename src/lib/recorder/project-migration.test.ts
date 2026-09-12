import { expect, it, vi } from "vitest";
import { DEFAULT_PARAMETERS } from "../dsp/biquad-eq.ts";
import { getAudioTrackSources } from "./audio-sources.ts";
import {
  deserializeRecorderRuntimeState,
  serializeRecorderRuntimeState,
} from "./persistence.ts";
import {
  migrateRecorderProject,
  type RecorderProjectInput,
} from "./project-migration.ts";
import { createDefaultRecorderRuntimeState } from "./runtime.ts";

vi.hoisted(() => vi.stubGlobal("AudioWorkletNode", class {}));

it("preserves legacy clip placement, stereo PCM, mix, take numbering, and comp precedence", () => {
  const project = legacyProject();
  const migrated = migrateRecorderProject(project);
  const restored = deserializeRecorderRuntimeState({ context, project });
  const [audio, capture] = restored.audioTracks;
  expect(migrated.audioTracks[0]!.clips[0]!.pcm).toBe(
    project.audioTracks[0]!.clip!.pcm,
  );
  expect(audio).toMatchObject({
    id: "audio",
    gain: 0.4,
    muted: false,
    soloed: true,
  });
  expect(audio!.clips[0]).toMatchObject({
    name: "stereo.wav",
    timelineOffset: -1,
    trimStart: 1,
    trimEnd: 4,
  });
  expect(audio!.clips[0]!.buffer!.numberOfChannels).toBe(2);
  expect(Array.from(audio!.clips[0]!.buffer!.getChannelData(1))).toEqual([
    5, 6, 7, 8,
  ]);
  expect(capture!.id).toBe(restored.armedTrackId);
  expect(capture).toMatchObject({ gain: 0.8, nextTakeNumber: 12 });
  expect(capture!.clips.map((clip) => [clip.id, clip.name])).toEqual([
    ["older", "Take 8"],
    ["newer", "Take 3"],
  ]);
  expect(
    getAudioTrackSources(capture!).map((source) => [
      source.timelineStart,
      source.timelineEnd,
    ]),
  ).toEqual([
    [0, 1],
    [1, 3],
    [3, 4],
  ]);
});

it("round trips multiple clips on any track without losing their identity or PCM", () => {
  const restored = deserializeRecorderRuntimeState({
    context,
    project: legacyProject(),
  });
  restored.audioTracks[0]!.clips.push({
    ...restored.audioTracks[1]!.clips[0]!,
    id: "overdub",
  });
  const serialized = serializeRecorderRuntimeState({
    ...createDefaultRecorderRuntimeState(),
    ...restored,
  });
  const roundTrip = deserializeRecorderRuntimeState({
    context,
    project: serialized,
  });
  expect(
    serializeRecorderRuntimeState({
      ...createDefaultRecorderRuntimeState(),
      ...roundTrip,
    }),
  ).toEqual(serialized);
  expect(roundTrip.audioTracks[0]!.clips.map((clip) => clip.id)).toEqual([
    restored.audioTracks[0]!.clips[0]!.id,
    "overdub",
  ]);
});

it("supplies defaults for projects saved before take identity and trimming", () => {
  const project = legacyProject();
  const take = project.recordingTrack.takes[0]!;
  delete take.id;
  delete take.number;
  delete project.recordingTrack.nextTakeNumber;
  const restored = deserializeRecorderRuntimeState({ context, project });
  expect(restored.audioTracks[1]!.clips[0]).toMatchObject({
    name: "Take 1",
    muted: false,
    soloed: false,
    trimStart: 0,
    trimEnd: 4,
  });
  expect(restored.audioTracks[1]!.nextTakeNumber).toBe(3);
});

it("preserves multiband EQ while migrating single-band EQ on either track", () => {
  const project = legacyProject();
  const single = { ...DEFAULT_PARAMETERS, bypass: true, gain: 6 };
  const multiband = {
    bypass: true,
    bands: [
      { ...DEFAULT_PARAMETERS, id: "low", frequency: 200, gain: 3 },
      { ...DEFAULT_PARAMETERS, id: "high", frequency: 4000, gain: -4 },
    ],
  };
  project.audioTracks[0]!.eq = single;
  project.recordingTrack.eq = multiband;
  const migrated = deserializeRecorderRuntimeState({ context, project });
  expect(migrated.audioTracks[0]!.eq).toMatchObject({
    bypass: false,
    bands: [single],
  });
  expect(migrated.audioTracks[1]!.eq).toEqual(multiband);
  const saved = serializeRecorderRuntimeState({
    ...createDefaultRecorderRuntimeState(),
    ...migrated,
  });
  // Also accept uniform-track projects written before multiband EQ was merged.
  saved.audioTracks[1]!.eq = single;
  const restored = deserializeRecorderRuntimeState({ context, project: saved });
  expect(restored.audioTracks[1]!.eq).toMatchObject({
    bypass: false,
    bands: [single],
  });
});

it("retains saved clip names and the next take number after deletion", () => {
  const project = legacyProject();
  project.recordingTrack.takes[0]!.name = "Verse lead";
  project.recordingTrack.takes.splice(1, 1);
  const restored = deserializeRecorderRuntimeState({ context, project });
  expect(restored.audioTracks[1]!.clips[0]!.name).toBe("Verse lead");
  expect(restored.audioTracks[1]!.nextTakeNumber).toBe(12);
  const saved = serializeRecorderRuntimeState({
    ...createDefaultRecorderRuntimeState(),
    ...restored,
  });
  expect(saved.audioTracks[1]!.clips[0]).not.toHaveProperty("number");
  expect(
    deserializeRecorderRuntimeState({ context, project: saved }).audioTracks[1]!
      .clips[0]!.name,
  ).toBe("Verse lead");
});

function legacyProject(): Extract<
  RecorderProjectInput,
  { recordingTrack: unknown }
> {
  const pcm = { sampleRate: 1, channels: [new Float32Array([1, 2, 3, 4])] };
  return {
    title: "Legacy",
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    latencyCompensation: 0,
    audioTracks: [
      {
        id: "audio",
        height: 72,
        gain: 0.4,
        muted: false,
        soloed: true,
        timelineOffset: -1,
        trimStart: 1,
        trimEnd: 4,
        clip: {
          name: "stereo.wav",
          pcm: {
            ...pcm,
            channels: [...pcm.channels, new Float32Array([5, 6, 7, 8])],
          },
        },
      },
    ],
    recordingTrack: {
      height: 116,
      gain: 0.8,
      muted: false,
      soloed: false,
      nextTakeNumber: 12,
      takes: [
        { id: "older", number: 8, timelineOffset: 0, pcm },
        { id: "newer", number: 3, timelineOffset: 1, trimEnd: 2, pcm },
      ],
    },
  };
}

const context = {
  createBuffer(
    numberOfChannels: number,
    length: number,
    sampleRate: number,
  ): AudioBuffer {
    const channels = Array.from(
      { length: numberOfChannels },
      () => new Float32Array(length),
    );
    return {
      numberOfChannels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: (channel: number) => channels[channel]!,
    } as AudioBuffer;
  },
};
