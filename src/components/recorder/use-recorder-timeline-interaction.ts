import type {
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";
import { useRecorderLocatorInteraction } from "./recorder-locators";
import { useRecorderClipInteraction } from "./use-recorder-clip-interaction";

export function useRecorderTimelineInteraction({
  runtime,
  state,
  subdivisionsPerBeat,
}: {
  runtime: RecorderRuntime;
  state: RecorderRuntimeState;
  subdivisionsPerBeat: number;
}) {
  const clipInteraction = useRecorderClipInteraction({
    runtime,
    state,
    onActivate: () => locatorInteraction.clear(),
  });

  const locatorInteraction = useRecorderLocatorInteraction({
    runtime,
    state,
    subdivisionsPerBeat,
    onActivate: () => clipInteraction.clear(),
  });

  function clearSelection() {
    const hadSelection =
      clipInteraction.hasSelection ||
      locatorInteraction.selectedId !== undefined;
    clipInteraction.clear();
    locatorInteraction.clear();
    return hadSelection;
  }

  function deleteSelection() {
    if (clipInteraction.hasSelection) {
      clipInteraction.removeSelected();
    } else if (locatorInteraction.selectedId !== undefined) {
      locatorInteraction.removeSelected();
    } else {
      return false;
    }
    return true;
  }

  return {
    clipInteraction,
    locatorInteraction,
    clearSelection,
    deleteSelection,
  };
}
