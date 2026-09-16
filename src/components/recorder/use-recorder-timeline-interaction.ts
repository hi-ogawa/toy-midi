import { useState } from "react";
import type {
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";
import { useRecorderLocators } from "./recorder-locators";
import {
  type RecorderClipSelection,
  useRecorderClipInteraction,
} from "./use-recorder-clip-interaction";

type RecorderTimelineSelection =
  | { type: "clips"; keys: RecorderClipSelection }
  | { type: "locator"; id: string };

const EMPTY_CLIPS: RecorderClipSelection = new Set();

export function useRecorderTimelineInteraction({
  runtime,
  state,
  subdivisionsPerBeat,
}: {
  runtime: RecorderRuntime;
  state: RecorderRuntimeState;
  subdivisionsPerBeat: number;
}) {
  const [current, setCurrent] = useState<RecorderTimelineSelection>();

  function setClips(keys: RecorderClipSelection) {
    setCurrent(keys.size > 0 ? { type: "clips", keys } : undefined);
  }

  function setLocator(id: string | undefined) {
    setCurrent(id !== undefined ? { type: "locator", id } : undefined);
  }

  const clips = useRecorderClipInteraction({
    runtime,
    state,
    selection: current?.type === "clips" ? current.keys : EMPTY_CLIPS,
    onSelectionChange: setClips,
  });
  const locators = useRecorderLocators({
    runtime,
    state,
    subdivisionsPerBeat,
    selectedId: current?.type === "locator" ? current.id : undefined,
    onSelectionChange: setLocator,
  });

  function clearSelection() {
    if (!current) {
      return false;
    }
    setCurrent(undefined);
    return true;
  }

  function deleteSelection() {
    if (!current) {
      return false;
    }
    if (current.type === "clips") {
      clips.removeSelected();
    } else {
      locators.removeSelected();
    }
    return true;
  }

  return {
    selection: current,
    clips,
    locators,
    clearSelection,
    deleteSelection,
  };
}
