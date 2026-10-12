import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeSharedProject, encodeSharedProject } from "./project-share";
import {
  createDefaultEditorRuntimeState,
  createMidiTrackState,
} from "./runtime";

vi.hoisted(() => {
  vi.stubGlobal("AudioWorkletNode", class {});
});

afterEach(() => vi.unstubAllGlobals());

describe("project share", () => {
  it("round-trips MIDI tracks, tempo, and time signature", async () => {
    const state = createDefaultEditorRuntimeState();
    state.title = "Riff";
    state.tempo = 98;
    state.timeSignature = { numerator: 6, denominator: 8 };
    state.midiTracks = [
      {
        ...createMidiTrackState({
          name: "Bass",
          preset: { program: 33 },
        }),
        gain: 0.5,
        pan: -0.25,
        notes: [
          { id: "a", pitch: 33, start: 0, duration: 1, velocity: 100 },
          { id: "b", pitch: 40, start: 1.5, duration: 0.5, velocity: 80 },
        ],
      },
      {
        ...createMidiTrackState({
          name: "Drums",
          preset: { bank: 128, program: 0 },
        }),
        notes: [
          { id: "c", pitch: 36, start: 0, duration: 0.25, velocity: 127 },
        ],
      },
    ];

    const payload = await encodeSharedProject(state);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);

    const project = await decodeSharedProject(payload);
    expect(project).toMatchObject({
      title: "Riff",
      tempo: 98,
      timeSignature: { numerator: 6, denominator: 8 },
      audioTracks: [],
      midiTracks: [
        {
          name: "Bass",
          program: 33,
          gain: 0.5,
          pan: -0.25,
          notes: [
            { pitch: 33, start: 0, duration: 1, velocity: 100 },
            { pitch: 40, start: 1.5, duration: 0.5, velocity: 80 },
          ],
        },
        {
          name: "Drums",
          bank: 128,
          program: 0,
          notes: [{ pitch: 36, start: 0, duration: 0.25, velocity: 127 }],
        },
      ],
    });
    const ids = project.midiTracks!.flatMap((track) => [
      track.id,
      ...track.notes.map((note) => note.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects a payload that is not a project", async () => {
    await expect(decodeSharedProject("not-a-project")).rejects.toThrow(
      "The share link does not hold a readable project.",
    );
  });
});
