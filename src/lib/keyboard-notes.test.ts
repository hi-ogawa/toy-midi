import { describe, expect, it } from "vitest";
import { KeyboardNotes } from "./keyboard-notes";
import type { MidiDeviceMessage } from "./midi-device";

function createNotes() {
  const sent: MidiDeviceMessage[] = [];
  const notes = new KeyboardNotes();
  notes.connect((message) => sent.push(message));
  return { notes, sent };
}

describe("KeyboardNotes", () => {
  it("releases the pitch a key started after an octave shift", () => {
    const { notes, sent } = createNotes();
    notes.pressKey("KeyQ");
    notes.pressKey("BracketRight");
    notes.releaseKey("KeyQ");
    expect(sent).toEqual([
      { type: "note-on", pitch: 60, velocity: 100 },
      { type: "note-off", pitch: 60 },
    ]);
    expect(notes.store.get().heldPitches.size).toBe(0);
  });

  it("releases the previous pitch when the pointer slides", () => {
    const { notes, sent } = createNotes();
    notes.pressPointer(60);
    notes.slidePointer(62);
    notes.releasePointer();
    expect(sent).toEqual([
      { type: "note-on", pitch: 60, velocity: 100 },
      { type: "note-off", pitch: 60 },
      { type: "note-on", pitch: 62, velocity: 100 },
      { type: "note-off", pitch: 62 },
    ]);
  });

  it("ignores a pointer sliding with no button held", () => {
    const { notes, sent } = createNotes();
    notes.slidePointer(62);
    expect(sent).toEqual([]);
  });

  it("ends held notes on the old destination when connecting a new one", () => {
    const { notes, sent } = createNotes();
    notes.pressKey("KeyQ");
    const next: MidiDeviceMessage[] = [];
    notes.connect((message) => next.push(message));
    expect(sent.at(-1)).toEqual({ type: "note-off", pitch: 60 });
    expect(next).toEqual([]);

    // The key's own release no longer sends anything.
    notes.releaseKey("KeyQ");
    expect(next).toEqual([]);
  });

  it("stops shifting at the octave limits", () => {
    const { notes } = createNotes();
    for (let i = 0; i < 5; i++) {
      notes.shiftOctave(-1);
    }
    expect(notes.store.get().octave).toBe(-2);
  });
});
