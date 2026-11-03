import { createStore } from "../utils/store.ts";
import {
  type ComputerKeymap,
  getComputerKeyPitch,
} from "./computer-keyboard.ts";
import {
  LIVE_CONTROLLER_SETTINGS,
  type MidiMessage,
  PITCH_WHEEL_CENTER,
} from "./general-midi.ts";
import { clamp } from "./music.ts";

export const MIN_OCTAVE = -2;
export const MAX_OCTAVE = 2;
const MIN_VELOCITY = 1;
const MAX_VELOCITY = 127;

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

  // A key releases the pitch it started, even if the octave changed since.
  private keyPitches = new Map<string, number>();
  private pointerPitches = new Map<number, number>();

  constructor(
    private readonly options: {
      send: (message: MidiMessage) => void;
      keymap: ComputerKeymap;
    },
  ) {}

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
    this.options.send({ type: "controller", controller, value });
  }

  setPitchBend(value: number): void {
    this.store.update({ pitchBend: value });
    this.options.send({ type: "pitch-bend", value });
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

  /** Returns whether the key does anything, even when a repeat changes nothing. */
  pressKey({ code, repeat }: { code: string; repeat: boolean }): boolean {
    const { keymap } = this.options;
    const octaveShift = keymap.octaveKeys.get(code);
    if (octaveShift !== undefined) {
      if (!repeat) {
        this.shiftOctave(octaveShift);
      }
      return true;
    }
    const velocityShift = keymap.velocityKeys?.get(code);
    if (velocityShift !== undefined) {
      if (!repeat) {
        const velocity = this.store.get().velocity + velocityShift;
        this.setVelocity(clamp(velocity, MIN_VELOCITY, MAX_VELOCITY));
      }
      return true;
    }
    const pitch = getComputerKeyPitch({
      keymap,
      code,
      octave: this.store.get().octave,
    });
    if (pitch !== undefined) {
      if (!repeat) {
        this.keyPitches.set(code, pitch);
        this.press(pitch);
      }
      return true;
    }
    return false;
  }

  releaseKey(code: string): void {
    const pitch = this.keyPitches.get(code);
    if (pitch !== undefined) {
      this.keyPitches.delete(code);
      this.release(pitch);
    }
  }

  pressPointer({
    pointerId,
    pitch,
  }: {
    pointerId: number;
    pitch: number;
  }): void {
    this.pointerPitches.set(pointerId, pitch);
    this.press(pitch);
  }

  slidePointer({
    pointerId,
    pitch,
  }: {
    pointerId: number;
    pitch: number;
  }): void {
    if (this.pointerPitches.has(pointerId)) {
      this.releasePointer(pointerId);
      this.pressPointer({ pointerId, pitch });
    }
  }

  releasePointer(pointerId: number): void {
    const pitch = this.pointerPitches.get(pointerId);
    if (pitch !== undefined) {
      this.pointerPitches.delete(pointerId);
      this.release(pitch);
    }
  }

  releaseAll(): void {
    for (const pitch of this.store.get().heldPitches) {
      this.options.send({ type: "note-off", pitch });
    }
    this.keyPitches.clear();
    this.pointerPitches.clear();
    this.store.update({ heldPitches: new Set() });
  }

  private press(pitch: number): void {
    const { heldPitches, velocity } = this.store.get();
    if (!heldPitches.has(pitch)) {
      this.options.send({ type: "note-on", pitch, velocity });
      this.store.update({ heldPitches: new Set(heldPitches).add(pitch) });
    }
  }

  private release(pitch: number): void {
    // Another finger or key can still be holding the same note.
    if (
      [...this.keyPitches.values(), ...this.pointerPitches.values()].includes(
        pitch,
      )
    ) {
      return;
    }
    const next = new Set(this.store.get().heldPitches);
    if (next.delete(pitch)) {
      this.options.send({ type: "note-off", pitch });
      this.store.update({ heldPitches: next });
    }
  }
}
