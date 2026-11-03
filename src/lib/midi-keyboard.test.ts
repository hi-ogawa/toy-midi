import { describe, expect, it } from "vitest";
import type { MidiMessage } from "./general-midi";
import { MidiKeyboard } from "./midi-keyboard";

function createKeyboard() {
  const sent: MidiMessage[] = [];
  const keyboard = new MidiKeyboard({ send: (message) => sent.push(message) });
  return { keyboard, sent };
}

describe("MidiKeyboard", () => {
  it("releases the pitch a key started after an octave shift", () => {
    const { keyboard, sent } = createKeyboard();
    keyboard.pressKey({ code: "KeyQ", repeat: false });
    keyboard.pressKey({ code: "BracketRight", repeat: false });
    keyboard.releaseKey("KeyQ");
    expect(sent).toEqual([
      { type: "note-on", pitch: 60, velocity: 100 },
      { type: "note-off", pitch: 60 },
    ]);
    expect(keyboard.store.get().heldPitches.size).toBe(0);
  });

  it("reports bound keys but acts only on the first press", () => {
    const { keyboard, sent } = createKeyboard();
    expect(keyboard.pressKey({ code: "KeyA", repeat: false })).toBe(false);
    expect(keyboard.pressKey({ code: "BracketRight", repeat: false })).toBe(
      true,
    );
    expect(keyboard.pressKey({ code: "BracketRight", repeat: true })).toBe(
      true,
    );
    expect(keyboard.store.get().octave).toBe(1);
    expect(keyboard.pressKey({ code: "KeyQ", repeat: true })).toBe(true);
    expect(sent).toEqual([]);
  });

  it("releases the previous pitch when the pointer slides", () => {
    const { keyboard, sent } = createKeyboard();
    keyboard.pressPointer({ pointerId: 1, pitch: 60 });
    keyboard.slidePointer({ pointerId: 1, pitch: 62 });
    keyboard.releasePointer(1);
    expect(sent).toEqual([
      { type: "note-on", pitch: 60, velocity: 100 },
      { type: "note-off", pitch: 60 },
      { type: "note-on", pitch: 62, velocity: 100 },
      { type: "note-off", pitch: 62 },
    ]);
  });

  it("releases only the note under the pointer that lifted", () => {
    const { keyboard, sent } = createKeyboard();
    keyboard.pressPointer({ pointerId: 1, pitch: 60 });
    keyboard.pressPointer({ pointerId: 2, pitch: 64 });
    keyboard.releasePointer(1);
    expect(sent.at(-1)).toEqual({ type: "note-off", pitch: 60 });
    expect([...keyboard.store.get().heldPitches]).toEqual([64]);
  });

  it("keeps a note until every pointer on it lifts", () => {
    const { keyboard, sent } = createKeyboard();
    keyboard.pressPointer({ pointerId: 1, pitch: 60 });
    keyboard.pressPointer({ pointerId: 2, pitch: 60 });
    keyboard.releasePointer(1);
    expect(sent).toEqual([{ type: "note-on", pitch: 60, velocity: 100 }]);
    keyboard.releasePointer(2);
    expect(sent.at(-1)).toEqual({ type: "note-off", pitch: 60 });
  });

  it("ignores a pointer sliding with no button held", () => {
    const { keyboard, sent } = createKeyboard();
    keyboard.slidePointer({ pointerId: 1, pitch: 62 });
    expect(sent).toEqual([]);
  });

  it("springs the pitch bend back to center once", () => {
    const { keyboard, sent } = createKeyboard();
    keyboard.setPitchBend(10_000);
    keyboard.releasePitchBend();
    keyboard.releasePitchBend();
    expect(sent).toEqual([
      { type: "pitch-bend", value: 10_000 },
      { type: "pitch-bend", value: 8192 },
    ]);
  });

  it("stops shifting at the octave limits", () => {
    const { keyboard } = createKeyboard();
    for (let i = 0; i < 5; i++) {
      keyboard.shiftOctave(-1);
    }
    expect(keyboard.store.get().octave).toBe(-2);
  });
});
