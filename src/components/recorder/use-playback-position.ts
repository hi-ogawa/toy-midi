import { useSyncExternalStore } from "react";
import type { TransportStore } from "../../lib/recorder/transport";

/** Re-renders the caller on every playhead move, so keep callers small. */
export function usePlaybackPosition(transportStore: TransportStore): number {
  return useSyncExternalStore(
    transportStore.subscribe,
    () => transportStore.get().position,
  );
}
