import { useState, useSyncExternalStore } from "react";
import {
  getComputerKeyOctaveShift,
  getComputerKeyPitch,
} from "../lib/computer-keyboard";
import { LiveMidiKeyboard } from "../lib/live-midi-keyboard";
import { useWindowEvent } from "./use-window-event";

export function useLiveMidiKeyboard() {
  const [keyboard] = useState(() => new LiveMidiKeyboard());
  const state = useSyncExternalStore(
    keyboard.store.subscribe,
    keyboard.store.get,
  );

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
        keyboard.pressKey(event.code);
      }
    }
  });
  useWindowEvent("keyup", (event) => keyboard.releaseKey(event.code));
  useWindowEvent("pointerup", () => keyboard.releasePointer());
  // The window misses the key or pointer release once it loses focus.
  useWindowEvent("blur", () => keyboard.releaseAll());

  return { keyboard, ...state };
}
