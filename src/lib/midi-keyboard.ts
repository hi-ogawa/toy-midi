import { createStore } from "../utils/store.ts";
import {
  getComputerKeyOctaveShift,
  getComputerKeyPitch,
} from "./computer-keyboard.ts";
import {
  LIVE_CONTROLLER_SETTINGS,
  PITCH_WHEEL_CENTER,
} from "./general-midi.ts";
import type { MidiDeviceMessage } from "./midi-device.ts";
import { clamp } from "./music.ts";

export const MIN_OCTAVE = -2;
export const MAX_OCTAVE = 2;

type Send = (message: MidiDeviceMessage) => void;

/**
 * What a player does live on a keyboard, as MIDI messages. Every note-on gets
 * its note-off however the input changes while a note is held.
 */
export class MidiKeyboard {
  readonly store = createStore(() => ({
    heldPitches: new Set<number>() as ReadonlySet<number>,
    octave: 0,
    velocity: 100,
    pitchBend: PITCH_WHEEL_CENTER,
    controllerValues: Object.fromEntries(
      LIVE_CONTROLLER_SETTINGS.map(({ controller, defaultValue }) => [
        controller,
        defaultValue,
      ]),
    ) as Readonly<Record<number, number>>,
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

  setController({
    controller,
    value,
  }: {
    controller: number;
    value: number;
  }): void {
    const { controllerValues } = this.store.get();
    this.store.update({
      controllerValues: { ...controllerValues, [controller]: value },
    });
    this.send?.({ type: "controller", controller, value });
  }

  setPitchBend(value: number): void {
    this.store.update({ pitchBend: value });
    this.send?.({ type: "pitch-bend", value });
  }

  /** Springs the wheel back to center. */
  releasePitchBend(): void {
    if (this.store.get().pitchBend !== PITCH_WHEEL_CENTER) {
      this.setPitchBend(PITCH_WHEEL_CENTER);
    }
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
