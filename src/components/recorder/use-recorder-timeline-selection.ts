import { useState } from "react";
import type { RecorderClipSelection } from "./use-recorder-clip-interaction";

type RecorderTimelineSelection =
  | { type: "clips"; keys: RecorderClipSelection }
  | { type: "locator"; id: string };

const EMPTY_CLIPS: RecorderClipSelection = new Set();

export function useRecorderTimelineSelection() {
  const [current, setCurrent] = useState<RecorderTimelineSelection>();

  function setClips(keys: RecorderClipSelection) {
    setCurrent(keys.size > 0 ? { type: "clips", keys } : undefined);
  }

  function setLocator(id: string | undefined) {
    setCurrent(id !== undefined ? { type: "locator", id } : undefined);
  }

  return {
    current,
    clips: {
      selection: current?.type === "clips" ? current.keys : EMPTY_CLIPS,
      onSelectionChange: setClips,
    },
    locator: {
      selectedId: current?.type === "locator" ? current.id : undefined,
      onSelectionChange: setLocator,
    },
    clear: () => setCurrent(undefined),
  };
}
