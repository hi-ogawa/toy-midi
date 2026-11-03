import { createStore } from "../utils/store.ts";
import {
  getComputerKeyOctaveShift,
  getComputerKeyPitch,
} from "./computer-keyboard.ts";
import type { MidiDeviceMessage } from "./midi-device.ts";
import { clamp } from "./music.ts";

export const MIN_OCTAVE = -2;
export const MAX_OCTAVE = 2;

type Send = (message: MidiDeviceMessage) => void;

/**
 * Turns computer keys and a pointer into note messages, so that every note-on
 * gets its note-off however the input changes while a note is held.
 */
export class KeyboardNotes {
  readonly store = createStore(() => ({
    heldPitches: new Set<number>() as ReadonlySet<number>,
    octave: 0,
    velocity: 100,
  }));

  private send?: Send;
  // A key releases the pitch it started, even if the octave changed since.
  private keyPitches = new Map<string, number>();
  private pointerPitch?: number;

  /** Ends held notes on the current destination before switching to the next. */
  connect(send: Send): void {
    this.releaseAll();
    this.send = send;
  }

  setVelocity(velocity: number): void {
    this.store.update({ velocity });
  }

  shiftOctave(delta: number): void {
    const octave = this.store.get().octave + delta;
    this.store.update({ octave: clamp(octave, MIN_OCTAVE, MAX_OCTAVE) });
  }

  pressKey(code: string): void {
    const shift = getComputerKeyOctaveShift(code);
    if (shift !== undefined) {
      this.shiftOctave(shift);
    }
    const pitch = getComputerKeyPitch({
      code,
      octave: this.store.get().octave,
    });
    if (pitch !== undefined) {
      this.keyPitches.set(code, pitch);
      this.press(pitch);
    }
  }

  releaseKey(code: string): void {
    const pitch = this.keyPitches.get(code);
    if (pitch !== undefined) {
      this.keyPitches.delete(code);
      this.release(pitch);
    }
  }

  pressPointer(pitch: number): void {
    this.pointerPitch = pitch;
    this.press(pitch);
  }

  slidePointer(pitch: number): void {
    if (this.pointerPitch !== undefined) {
      this.release(this.pointerPitch);
      this.pressPointer(pitch);
    }
  }

  releasePointer(): void {
    if (this.pointerPitch !== undefined) {
      this.release(this.pointerPitch);
      this.pointerPitch = undefined;
    }
  }

  releaseAll(): void {
    for (const pitch of this.store.get().heldPitches) {
      this.send?.({ type: "note-off", pitch });
    }
    this.keyPitches.clear();
    this.pointerPitch = undefined;
    this.store.update({ heldPitches: new Set() });
  }

  private press(pitch: number): void {
    const { heldPitches, velocity } = this.store.get();
    if (!heldPitches.has(pitch)) {
      this.send?.({ type: "note-on", pitch, velocity });
      this.store.update({ heldPitches: new Set(heldPitches).add(pitch) });
    }
  }

  private release(pitch: number): void {
    const next = new Set(this.store.get().heldPitches);
    if (next.delete(pitch)) {
      this.send?.({ type: "note-off", pitch });
      this.store.update({ heldPitches: next });
    }
  }
}
