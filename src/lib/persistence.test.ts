import { describe, expect, it } from "vitest";
import {
  deserializeEditorRuntimeState,
  serializeEditorRuntimeState,
} from "./persistence.ts";
import { createMidiTrackState } from "./track-state.ts";

describe(deserializeEditorRuntimeState, () => {
  it("gives synth layers ids only while the project is open", () => {
    const state = deserializeEditorRuntimeState({
      context: {} as AudioContext,
      project: {
        title: "",
        audioTracks: [],
        midiTracks: [
          {
            ...createMidiTrackState(),
            name: "MIDI 1",
            synth: { layers: [{ oscillator: { waveform: "sine" } }] },
          },
        ],
        tempo: 120,
        timeSignature: { numerator: 4, denominator: 4 },
      },
    });
    expect(state.midiTracks[0].synth?.layers[0].id).toEqual(expect.any(String));
    const saved = serializeEditorRuntimeState(state);
    expect(saved.midiTracks?.[0].synth?.layers[0]).not.toHaveProperty("id");
  });
});
