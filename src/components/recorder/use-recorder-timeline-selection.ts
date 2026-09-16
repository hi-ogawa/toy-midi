import { useState } from "react";
import type { RecorderClipSelection } from "./use-recorder-clip-interaction";

type RecorderTimelineSelection =
  | { type: "clips"; keys: RecorderClipSelection }
  | { type: "locator"; id: string };

type RecorderTimelineSelectionHandlers = {
  [Type in RecorderTimelineSelection["type"]]: () => void;
};

const EMPTY_CLIPS: RecorderClipSelection = new Set();

export function useRecorderTimelineSelection() {
  const [current, setCurrent] = useState<RecorderTimelineSelection>();

  function setClips(keys: RecorderClipSelection) {
    setCurrent((current) =>
      keys.size > 0
        ? { type: "clips", keys }
        : current?.type === "clips"
          ? undefined
          : current,
    );
  }

  function setLocator(id: string | undefined) {
    setCurrent((current) =>
      id !== undefined
        ? { type: "locator", id }
        : current?.type === "locator"
          ? undefined
          : current,
    );
  }

  function activateClips() {
    setCurrent((current) => (current?.type === "clips" ? current : undefined));
  }

  function handleCurrent(handlers: RecorderTimelineSelectionHandlers) {
    if (!current) {
      return false;
    }
    handlers[current.type]();
    return true;
  }

  return {
    current,
    clips: {
      selection: current?.type === "clips" ? current.keys : EMPTY_CLIPS,
      onSelectionChange: setClips,
      onActivate: activateClips,
    },
    locator: {
      selectedId: current?.type === "locator" ? current.id : undefined,
      onSelectionChange: setLocator,
    },
    clear: () => setCurrent(undefined),
    handleCurrent,
  };
}
