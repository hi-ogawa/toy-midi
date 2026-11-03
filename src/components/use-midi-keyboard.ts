import { useEffectEvent, useState, useSyncExternalStore } from "react";
import type { ComputerKeymap } from "../lib/computer-keyboard";
import type { MidiMessage } from "../lib/general-midi";
import { isTextEntryTarget } from "../lib/keyboard";
import { MidiKeyboard } from "../lib/midi-keyboard";
import { useWindowEvent } from "./use-window-event";

export function useMidiKeyboard({
  send,
  keymap,
  capturesKeys,
}: {
  send: (message: MidiMessage) => void;
  keymap: ComputerKeymap;
  capturesKeys: boolean;
}) {
  const sendLatest = useEffectEvent(send);
  const [keyboard] = useState(
    () => new MidiKeyboard({ send: sendLatest, keymap }),
  );
  const state = useSyncExternalStore(
    keyboard.store.subscribe,
    keyboard.store.get,
  );

  // Capture phase, so captured keys work inside modal dialogs, which stop keys
  // from reaching the window, and take priority over editor shortcuts like L.
  useWindowEvent(
    "keydown",
    (event) => {
      if (
        !capturesKeys ||
        isTextEntryTarget(event.target) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      if (keyboard.pressKey({ code: event.code, repeat: event.repeat })) {
        // Otherwise a focused select takes the key for type-ahead.
        event.preventDefault();
        // Otherwise the editor also runs the shortcut on this key.
        event.stopPropagation();
      }
    },
    true,
  );
  useWindowEvent("keyup", (event) => keyboard.releaseKey(event.code), true);
  useWindowEvent("pointerup", (event) =>
    keyboard.releasePointer(event.pointerId),
  );
  useWindowEvent("pointercancel", (event) =>
    keyboard.releasePointer(event.pointerId),
  );
  // The window misses the key or pointer release once it loses focus.
  useWindowEvent("blur", () => keyboard.releaseAll());

  return { keyboard, ...state };
}
