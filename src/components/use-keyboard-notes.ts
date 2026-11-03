import { useRef, useState } from "react";
import {
  getComputerKeyOctaveShift,
  getComputerKeyPitch,
} from "../lib/computer-keyboard";
import type { MidiDeviceMessage } from "../lib/midi-device";
import { clamp } from "../lib/music";
import { useSetState } from "./use-set-state";
import { useWindowEvent } from "./use-window-event";

export const MIN_OCTAVE = -2;
export const MAX_OCTAVE = 2;

/** Turns computer keys and a pointer into note messages, and keeps notes from sticking. */
export function useKeyboardNotes({
  velocity,
  send,
}: {
  velocity: number;
  send: (message: MidiDeviceMessage) => void;
}) {
  const [heldPitches, heldPitchActions] = useSetState<number>();
  const [pointerPitch, setPointerPitch] = useState<number>();
  const [octave, setOctave] = useState(0);
  // A key releases the pitch it started, even if the octave changed since.
  const heldKeyPitches = useRef(new Map<string, number>());

  function press(pitch: number): void {
    if (!heldPitches.has(pitch)) {
      send({ type: "note-on", pitch, velocity });
      heldPitchActions.add(pitch);
    }
  }

  function release(pitch: number): void {
    if (heldPitches.has(pitch)) {
      send({ type: "note-off", pitch });
      heldPitchActions.remove(pitch);
    }
  }

  function releaseAll(): void {
    for (const pitch of heldPitches) {
      send({ type: "note-off", pitch });
    }
    heldPitchActions.replace(new Set());
    heldKeyPitches.current.clear();
    setPointerPitch(undefined);
  }

  function shiftOctave(delta: number): void {
    setOctave((current) => clamp(current + delta, MIN_OCTAVE, MAX_OCTAVE));
  }

  function pressPointer(pitch: number): void {
    press(pitch);
    setPointerPitch(pitch);
  }

  function slidePointer(pitch: number): void {
    if (pointerPitch !== undefined) {
      release(pointerPitch);
      pressPointer(pitch);
    }
  }

  useWindowEvent("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const shift = getComputerKeyOctaveShift(event.code);
    const pitch = getComputerKeyPitch({ code: event.code, octave });
    if (shift === undefined && pitch === undefined) {
      return;
    }
    // Otherwise a focused output picker takes the key for type-ahead.
    event.preventDefault();
    if (event.repeat) {
      return;
    }
    if (shift !== undefined) {
      shiftOctave(shift);
    }
    if (pitch !== undefined) {
      heldKeyPitches.current.set(event.code, pitch);
      press(pitch);
    }
  });
  useWindowEvent("keyup", (event) => {
    const pitch = heldKeyPitches.current.get(event.code);
    if (pitch !== undefined) {
      heldKeyPitches.current.delete(event.code);
      release(pitch);
    }
  });
  useWindowEvent("pointerup", () => {
    if (pointerPitch !== undefined) {
      release(pointerPitch);
      setPointerPitch(undefined);
    }
  });
  // The window misses the key or pointer release once it loses focus.
  useWindowEvent("blur", releaseAll);

  return {
    heldPitches,
    octave,
    shiftOctave,
    pressPointer,
    slidePointer,
    releaseAll,
  };
}
