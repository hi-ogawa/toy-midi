import { useSyncExternalStore } from "react";
import { type AudioState, audioManager } from "../lib/audio";

/**
 * Hook that provides reactive transport state from Tone.js Transport.
 *
 * Returns:
 * - isPlaying: whether transport is playing
 * - position: current position in seconds (updates at 60fps during playback)
 *
 * Control methods (play/pause/stop/seek) are on audioManager,
 * which handles app-specific logic like note scheduling.
 */
export function useAudio<T>(selector: (state: AudioState) => T): T {
  return useSyncExternalStore(audioManager.subscribe, () =>
    selector(audioManager.getState()),
  );
}
