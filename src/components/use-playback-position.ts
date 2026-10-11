import { useSyncExternalStore } from "react";
import type { EditorRuntime } from "../lib/runtime";

/** Re-renders the caller on every playhead move, so keep callers small. */
export function usePlaybackPosition(runtime: EditorRuntime): number {
  return useSyncExternalStore(
    runtime.transport.store.subscribe,
    () => runtime.transport.store.get().position,
  );
}
