import { describe, expect, it } from "vitest";
import { EMPTY_AUDIO_VIEW } from "../audio-view.ts";
import { deriveTrackMix, resolveRecorderMix } from "./mix.ts";
import type { RecorderRuntimeState } from "./runtime.ts";
import { deriveTakeRegions } from "./take-regions.ts";
import type { TakeState } from "./take.ts";

type MixState = Pick<
  RecorderRuntimeState,
  "audioTracks" | "recordingTrack" | "takeRegions" | "masterGain"
>;

describe(resolveRecorderMix, () => {
  it.each([
    { timelineOffset: 3, start: 5, offset: 2, duration: 4 },
    { timelineOffset: -1, start: 1, offset: 2, duration: 4 },
    { timelineOffset: -4, start: 0, offset: 4, duration: 2 },
  ])("resolves imported trims at offset $timelineOffset", (expected) => {
    const track = audioTrack({
      timelineOffset: expected.timelineOffset,
      trimStart: 2,
      trimEnd: 6,
    });
    const mix = resolveRecorderMix(state({ audioTracks: [track] }));

    expect(mix).toEqual({
      tracks: [
        {
          gain: 0.5,
          regions: [
            {
              buffer: track.clip!.buffer,
              start: expected.start,
              offset: expected.offset,
              duration: expected.duration,
            },
          ],
        },
        { gain: 0.75, regions: [] },
      ],
      masterGain: 0.8,
      duration: expected.start + expected.duration,
    });
  });

  it("uses committed Capture splits and crops them at timeline zero", () => {
    const old = take({ timelineOffset: -2, trimStart: 1, trimEnd: 10 });
    const newer = take({
      id: "new",
      timelineOffset: 2,
      trimStart: 1,
      trimEnd: 3,
    });
    const uncommitted = take({ id: "uncommitted", timelineOffset: 20 });
    const input = state({ takeRegions: deriveTakeRegions([old, newer]) });
    input.recordingTrack.takes = [old, newer, uncommitted];

    expect(resolveRecorderMix(input)).toEqual({
      tracks: [
        {
          gain: 0.75,
          regions: [
            { buffer: old.buffer, start: 0, offset: 2, duration: 3 },
            { buffer: newer.buffer, start: 3, offset: 1, duration: 2 },
            { buffer: old.buffer, start: 5, offset: 7, duration: 3 },
          ],
        },
      ],
      masterGain: 0.8,
      duration: 8,
    });
  });

  it.each(["imported", "Capture"])(
    "retains extent when %s is muted",
    (kind) => {
      const input = state({
        audioTracks: [audioTrack({ trimEnd: kind === "imported" ? 10 : 2 })],
        takeRegions: deriveTakeRegions([
          take({ trimEnd: kind === "Capture" ? 10 : 2 }),
        ]),
      });
      input.audioTracks[0]!.muted = kind === "imported";
      input.recordingTrack.muted = kind === "Capture";

      const mix = resolveRecorderMix(input);
      expect(mix.duration).toBe(10);
      expect(mix.tracks.map((track) => track.gain)).toEqual(
        kind === "imported" ? [0, 0.75] : [0.5, 0],
      );
      expect(mix.tracks.every((track) => track.regions.length === 1)).toBe(
        true,
      );
    },
  );

  it("snapshots gains and scalar region coordinates without copying buffers", () => {
    const imported = audioTrack({
      timelineOffset: 2,
      trimStart: 1,
      trimEnd: 4,
    });
    const captured = take({ timelineOffset: 3, trimStart: 2, trimEnd: 6 });
    const input = state({
      audioTracks: [imported],
      takeRegions: deriveTakeRegions([captured]),
    });
    const mix = resolveRecorderMix(input);
    const gains = deriveTrackMix(input);

    input.masterGain = 0;
    imported.gain = 2;
    imported.muted = true;
    imported.timelineOffset = 30;
    imported.trimStart = 0;
    imported.trimEnd = 10;
    input.recordingTrack.gain = 3;
    input.recordingTrack.soloed = true;
    captured.timelineOffset = 40;
    captured.trimStart = 0;
    captured.trimEnd = 10;
    input.takeRegions[0]!.timelineStart = 40;
    input.takeRegions[0]!.timelineEnd = 50;
    input.audioTracks.length = 0;
    input.takeRegions.length = 0;

    expect(gains).toEqual({ audioTrackGains: [0.5], recordingGain: 0.75 });
    expect(mix).toEqual({
      tracks: [
        {
          gain: 0.5,
          regions: [
            { buffer: imported.clip!.buffer, start: 3, offset: 1, duration: 3 },
          ],
        },
        {
          gain: 0.75,
          regions: [
            { buffer: captured.buffer, start: 5, offset: 2, duration: 4 },
          ],
        },
      ],
      masterGain: 0.8,
      duration: 9,
    });
    expect(mix.tracks[0]!.regions[0]!.buffer).toBe(imported.clip!.buffer);
    expect(mix.tracks[1]!.regions[0]!.buffer).toBe(captured.buffer);
  });

  it("has zero extent for an empty arrangement", () => {
    expect(resolveRecorderMix(state())).toEqual({
      tracks: [{ gain: 0.75, regions: [] }],
      masterGain: 0.8,
      duration: 0,
    });
  });

  it("omits empty tracks, missing buffers, zero-length trims and all prezero audio", () => {
    const input = state({
      audioTracks: [
        audioTrack({ clip: undefined }),
        audioTrack({ trimStart: 2, trimEnd: 2 }),
        audioTrack({ timelineOffset: -10 }),
        audioTrack({ timelineOffset: -11 }),
      ],
      takeRegions: deriveTakeRegions([
        take({ timelineOffset: -20 }),
        take({ timelineOffset: -10 }),
        take({ timelineOffset: 2, buffer: undefined }),
      ]),
    });
    const mix = resolveRecorderMix(input);
    expect(mix.duration).toBe(0);
    expect(mix.tracks.map((track) => track.regions)).toEqual([
      [],
      [],
      [],
      [],
      [],
    ]);
  });
});

describe(deriveTrackMix, () => {
  it.each([
    { name: "no solo", imported: {}, capture: {}, expected: [0.5, 0.25, 0.75] },
    {
      name: "imported mute",
      imported: { muted: true },
      capture: {},
      expected: [0, 0.25, 0.75],
    },
    {
      name: "Capture mute",
      imported: {},
      capture: { muted: true },
      expected: [0.5, 0.25, 0],
    },
    {
      name: "imported solo",
      imported: { soloed: true },
      capture: {},
      expected: [0.5, 0, 0],
    },
    {
      name: "Capture solo",
      imported: {},
      capture: { soloed: true },
      expected: [0, 0, 0.75],
    },
    {
      name: "shared solo",
      imported: { soloed: true },
      capture: { soloed: true },
      expected: [0.5, 0, 0.75],
    },
    {
      name: "muted imported solo",
      imported: { muted: true, soloed: true },
      capture: {},
      expected: [0, 0, 0],
    },
    {
      name: "muted Capture solo",
      imported: {},
      capture: { muted: true, soloed: true },
      expected: [0, 0, 0],
    },
    {
      name: "empty imported solo",
      imported: { clip: undefined, soloed: true },
      capture: {},
      expected: [0.5, 0, 0],
    },
    {
      name: "empty Capture solo",
      imported: {},
      capture: { takes: [], soloed: true },
      expected: [0, 0, 0.75],
    },
  ])(
    "shares $name semantics with the resolved mix",
    ({ imported, capture, expected }) => {
      const captured = take();
      const input = state({
        audioTracks: [
          audioTrack(imported),
          audioTrack({ id: "second", gain: 0.25 }),
        ],
      });
      input.recordingTrack = {
        ...input.recordingTrack,
        takes: [captured],
        ...capture,
      };
      input.takeRegions = deriveTakeRegions(input.recordingTrack.takes);

      expect(deriveTrackMix(input)).toEqual({
        audioTrackGains: expected.slice(0, 2),
        recordingGain: expected[2],
      });
      expect(
        resolveRecorderMix(input).tracks.map((track) => track.gain),
      ).toEqual(expected);
    },
  );
});

function state(overrides: Partial<MixState> = {}): MixState {
  return {
    audioTracks: [],
    recordingTrack: {
      height: 128,
      gain: 0.75,
      muted: false,
      soloed: false,
      takes: [],
      nextTakeNumber: 1,
    },
    takeRegions: [],
    masterGain: 0.8,
    ...overrides,
  };
}

function audioTrack(
  overrides: Partial<MixState["audioTracks"][number]> = {},
): MixState["audioTracks"][number] {
  return {
    id: "imported",
    height: 96,
    clip: {
      name: "audio.wav",
      buffer: { duration: 10 } as AudioBuffer,
      audioView: EMPTY_AUDIO_VIEW,
    },
    gain: 0.5,
    muted: false,
    soloed: false,
    timelineOffset: 0,
    trimStart: 0,
    trimEnd: 10,
    ...overrides,
  };
}

function take(overrides: Partial<TakeState> = {}): TakeState {
  return {
    id: "take",
    number: 1,
    muted: false,
    soloed: false,
    duration: 10,
    trimStart: 0,
    trimEnd: 10,
    timelineOffset: 0,
    buffer: { duration: 10 } as AudioBuffer,
    ...overrides,
  };
}
