import { describe, expect, it } from "vitest";
import type { MidiDeviceMessage } from "./midi-device";
import { MidiKeyboard } from "./midi-keyboard";

function createKeyboard() {
  const sent: MidiDeviceMessage[] = [];
  const keyboard = new MidiKeyboard({ send: (message) => sent.push(message) });
  return { keyboard, sent };
}

describe("MidiKeyboard", () => {
  it("releases the pitch a key started after an octave shift", () => {
    const { keyboard, sent } = createKeyboard();
    keyboard.pressKey("KeyQ");
    keyboard.pressKey("BracketRight");
    keyboard.releaseKey("KeyQ");
    expect(sent).toEqual([
      { type: "note-on", pitch: 60, velocity: 100 },
      { type: "note-off", pitch: 60 },
    ]);
    expect(keyboard.store.get().heldPitches.size).toBe(0);
  });

  it("releases the previous pitch when the pointer slides", () => {
    const { keyboard, sent } = createKeyboard();
    keyboard.pressPointer(60);
    keyboard.slidePointer(62);
    keyboard.releasePointer();
    expect(sent).toEqual([
      { type: "note-on", pitch: 60, velocity: 100 },
      { type: "note-off", pitch: 60 },
      { type: "note-on", pitch: 62, velocity: 100 },
      { type: "note-off", pitch: 62 },
    ]);
  });

  it("ignores a pointer sliding with no button held", () => {
    const { keyboard, sent } = createKeyboard();
    keyboard.slidePointer(62);
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
