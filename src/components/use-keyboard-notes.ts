import { useState, useSyncExternalStore } from "react";
import {
  getComputerKeyOctaveShift,
  getComputerKeyPitch,
} from "../lib/computer-keyboard";
import { KeyboardNotes } from "../lib/keyboard-notes";
import { useWindowEvent } from "./use-window-event";

export function useKeyboardNotes() {
  const [notes] = useState(() => new KeyboardNotes());
  const state = useSyncExternalStore(notes.store.subscribe, notes.store.get);

  useWindowEvent("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const isBound =
      getComputerKeyOctaveShift(event.code) !== undefined ||
      getComputerKeyPitch({ code: event.code, octave: 0 }) !== undefined;
    if (isBound) {
      // Otherwise a focused output picker takes the key for type-ahead.
      event.preventDefault();
      if (!event.repeat) {
        notes.pressKey(event.code);
      }
    }
  });
  useWindowEvent("keyup", (event) => notes.releaseKey(event.code));
  useWindowEvent("pointerup", () => notes.releasePointer());
  // The window misses the key or pointer release once it loses focus.
  useWindowEvent("blur", () => notes.releaseAll());

  return { notes, ...state };
}
