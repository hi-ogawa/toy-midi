import type {
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";
import { useRecorderLocatorInteraction } from "./recorder-locators";
import { useRecorderClipInteraction } from "./use-recorder-clip-interaction";

export function useRecorderInteraction({
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
    onSelect: () => locatorInteraction.select(undefined),
  });

  const locatorInteraction = useRecorderLocatorInteraction({
    runtime,
    state,
    subdivisionsPerBeat,
    onSelect: () => clipInteraction.clear(),
  });

  function clearSelection() {
    const hadSelection =
      clipInteraction.hasSelection ||
      locatorInteraction.selectedId !== undefined;
    clipInteraction.clear();
    locatorInteraction.select(undefined);
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
