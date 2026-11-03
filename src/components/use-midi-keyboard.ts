import { useEffectEvent, useState, useSyncExternalStore } from "react";
import type { MidiDeviceMessage } from "../lib/midi-device";
import { MidiKeyboard } from "../lib/midi-keyboard";
import { useWindowEvent } from "./use-window-event";

export function useMidiKeyboard({
  send,
}: {
  send: (message: MidiDeviceMessage) => void;
}) {
  const sendLatest = useEffectEvent(send);
  const [keyboard] = useState(() => new MidiKeyboard({ send: sendLatest }));
  const state = useSyncExternalStore(
    keyboard.store.subscribe,
    keyboard.store.get,
  );

  useWindowEvent("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (keyboard.pressKey({ code: event.code, repeat: event.repeat })) {
      // Otherwise a focused output picker takes the key for type-ahead.
      event.preventDefault();
    }
  });
  useWindowEvent("keyup", (event) => keyboard.releaseKey(event.code));
  useWindowEvent("pointerup", () => keyboard.releasePointer());
  // The window misses the key or pointer release once it loses focus.
  useWindowEvent("blur", () => keyboard.releaseAll());

  return { keyboard, ...state };
}
