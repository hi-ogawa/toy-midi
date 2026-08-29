import { describe, expect, test, vi } from "vitest";
import { deserializeRecorderRuntimeState } from "./persistence";

describe("recorder persistence", () => {
  test("defaults mixer gains for projects saved before mixer support", () => {
    const context = {
      createBuffer: vi.fn(),
    } as unknown as AudioContext;
    const state = deserializeRecorderRuntimeState({
      context,
      project: {
        title: "Legacy recorder project",
        audioTracks: [],
        recordingTrack: {
          height: 128,
          gain: 1,
          muted: false,
          soloed: false,
          takes: [],
        },
        latencyCompensation: 0,
        tempo: 120,
        timeSignature: { numerator: 4, denominator: 4 },
      },
    });

    expect(state.masterGain).toBe(1);
    expect(state.metronomeGain).toBe(0.5);
  });
});
