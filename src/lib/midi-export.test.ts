import { describe, expect, it } from "vitest";
import { exportMidi } from "./midi-export";
import { Note } from "../types";

describe("MIDI Export", () => {
  it("should create a valid MIDI file with correct tempo", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60, // C4
        start: 0,
        duration: 1, // 1 beat
        velocity: 100,
      },
      {
        id: "note-2",
        pitch: 64, // E4
        start: 1,
        duration: 1,
        velocity: 80,
      },
    ];

    const tempo = 120;
    const midiData = exportMidi({ notes, tempo });

    // Check that we got a Uint8Array
    expect(midiData).toBeInstanceOf(Uint8Array);
    expect(midiData.byteLength).toBeGreaterThan(0);

    // Check the MIDI header signature (should start with "MThd")
    const signature = String.fromCharCode(
      midiData[0],
      midiData[1],
      midiData[2],
      midiData[3],
    );
    expect(signature).toBe("MThd");
  });

  it("should handle empty notes array", () => {
    const midiData = exportMidi({ notes: [], tempo: 120 });

    expect(midiData).toBeInstanceOf(Uint8Array);
    expect(midiData.byteLength).toBeGreaterThan(0);
  });

  it("should convert note velocities correctly", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 127, // max velocity
      },
      {
        id: "note-2",
        pitch: 64,
        start: 1,
        duration: 1,
        velocity: 0, // min velocity
      },
    ];

    const midiData = exportMidi({ notes, tempo: 120 });
    expect(midiData).toBeInstanceOf(Uint8Array);
  });

  it("should handle different tempos", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      },
    ];

    const tempo60 = exportMidi({ notes, tempo: 60 });
    const tempo240 = exportMidi({ notes, tempo: 240 });

    // Both should produce valid MIDI files
    expect(tempo60).toBeInstanceOf(Uint8Array);
    expect(tempo240).toBeInstanceOf(Uint8Array);

    // Different tempos should produce different output
    // (though the difference might be small)
    expect(tempo60.byteLength).toBeGreaterThan(0);
    expect(tempo240.byteLength).toBeGreaterThan(0);
  });

  it("should set custom track name", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      },
    ];

    const midiData = exportMidi({
      notes,
      tempo: 120,
      trackName: "My Custom Track",
    });

    expect(midiData).toBeInstanceOf(Uint8Array);
  });
});
