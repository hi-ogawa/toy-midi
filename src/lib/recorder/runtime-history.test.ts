import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MidiTrackPlayback } from "./midi-track-playback.ts";
import { RecorderRuntime } from "./runtime.ts";

vi.hoisted(() => {
  vi.stubGlobal("AudioWorkletNode", class {});
});

vi.mock("./midi-track-playback.ts", () => ({
  MidiTrackPlayback: { create: vi.fn() },
}));

beforeEach(() => {
  vi.stubGlobal(
    "AudioContext",
    class {
      currentTime = 0;
      createGain() {
        return {
          connect: vi.fn(),
          gain: { value: 0, setValueAtTime: vi.fn() },
        };
      }
    },
  );
  vi.mocked(MidiTrackPlayback.create).mockImplementation(
    async () =>
      ({
        dispose: vi.fn(),
        setNotes: vi.fn(),
        setTempo: vi.fn(),
        channel: { setGain: vi.fn() },
      }) as unknown as MidiTrackPlayback,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("recorder MIDI track history", () => {
  it("replays add, note edits, and removal in order with the same IDs", async () => {
    const runtime = new RecorderRuntime();
    const firstId = await runtime.addMidiTrack();
    const secondId = await runtime.addMidiTrack();
    const notes = [
      { id: "note", pitch: 60, start: 1, duration: 1, velocity: 100 },
    ];
    runtime.setMidiTrackNotes(firstId, notes);
    const firstPlayback = await vi.mocked(MidiTrackPlayback.create).mock
      .results[0].value;
    runtime.removeMidiTrack(firstId);
    expect(firstPlayback.dispose).toHaveBeenCalledOnce();
    expect(runtime.store.get().midiTracks.map((track) => track.id)).toEqual([
      secondId,
    ]);

    await runtime.undo();
    expect(runtime.store.get().midiTracks.map((track) => track.id)).toEqual([
      firstId,
      secondId,
    ]);
    expect(runtime.store.get().midiTracks[0].notes).toEqual(notes);
    await runtime.undo();
    expect(runtime.store.get().midiTracks[0].notes).toEqual([]);
    await runtime.undo();
    await runtime.undo();
    expect(runtime.store.get().midiTracks).toEqual([]);

    await runtime.redo();
    await runtime.redo();
    await runtime.redo();
    expect(runtime.store.get().midiTracks[0].notes).toEqual(notes);
    await runtime.redo();
    expect(runtime.store.get().midiTracks.map((track) => track.id)).toEqual([
      secondId,
    ]);
  });

  it("restores a full track snapshot and initializes playback with current tempo and mix", async () => {
    const runtime = new RecorderRuntime();
    const id = await runtime.addMidiTrack();
    const track = {
      ...runtime.store.get().midiTracks[0],
      name: "Lead",
      program: 42,
      height: 180,
      gain: 0.3,
      muted: true,
      soloed: true,
      tabAnnotationEnabled: true,
      tabOpenStringPitches: [40, 45],
      keySignature: { fifths: 2, mode: "major" as const },
    };
    runtime.store.update({ midiTracks: [track] });
    runtime.removeMidiTrack(id);
    runtime.store.update({ tempo: 120 });
    await runtime.undo();
    expect(runtime.store.get().midiTracks).toEqual([track]);
    expect(MidiTrackPlayback.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ track, tempo: 120 }),
    );
    const playback = await vi
      .mocked(MidiTrackPlayback.create)
      .mock.results.at(-1)!.value;
    expect(playback.channel.setGain).toHaveBeenLastCalledWith(0);
    expect(playback.setTempo).toHaveBeenLastCalledWith(120);
  });

  it("can retry restoration after synth initialization fails", async () => {
    const runtime = new RecorderRuntime();
    const id = await runtime.addMidiTrack();
    runtime.removeMidiTrack(id);
    vi.mocked(MidiTrackPlayback.create).mockRejectedValueOnce(
      new Error("synth failed"),
    );
    await expect(runtime.undo()).rejects.toThrow("synth failed");
    expect(runtime.store.get().midiTracks).toEqual([]);
    await runtime.undo();
    expect(runtime.store.get().midiTracks[0].id).toBe(id);
    await runtime.redo();
    expect(runtime.store.get().midiTracks).toEqual([]);
  });

  it("does not record failed creation or removal of a missing track", async () => {
    const runtime = new RecorderRuntime();
    const id = await runtime.addMidiTrack();
    vi.mocked(MidiTrackPlayback.create).mockRejectedValueOnce(
      new Error("synth failed"),
    );
    await expect(runtime.addMidiTrack()).rejects.toThrow("synth failed");
    runtime.removeMidiTrack("missing");
    await runtime.undo();
    expect(runtime.store.get().midiTracks).toEqual([]);
    await runtime.redo();
    expect(runtime.store.get().midiTracks[0].id).toBe(id);
  });
});
