import { useSyncExternalStore } from "react";
import { type AudioState, audioManager } from "../lib/audio";

/**
 * Selects reactive state from AudioManager.
 *
 * Select primitives or stable references because the selected value is the
 * useSyncExternalStore snapshot. Do not construct a new object in the selector.
 * For example: useAudio((state) => state.isPlaying).
 */
export function useAudio<T>(selector: (state: AudioState) => T): T {
  return useSyncExternalStore(audioManager.state.subscribe, () =>
    selector(audioManager.state.getSnapshot()),
  );
}
