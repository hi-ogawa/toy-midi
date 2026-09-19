import { useMutation } from "@tanstack/react-query";
import { matchKeyboardEvent } from "../../lib/keyboard";
import type {
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";
import { useRecorderLocatorInteraction } from "./recorder-locators";
import { useRecorderClipInteraction } from "./use-recorder-clip-interaction";
import { useRecorderMidiInteraction } from "./use-recorder-midi-interaction";

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
    onSelect: () => {
      locatorInteraction.select(undefined);
      midiInteraction.clear();
    },
  });

  const locatorInteraction = useRecorderLocatorInteraction({
    runtime,
    state,
    subdivisionsPerBeat,
    onSelect: () => {
      clipInteraction.clear();
      midiInteraction.clear();
    },
  });

  const midiInteraction = useRecorderMidiInteraction({
    runtime,
    state,
    subdivisionsPerBeat,
    onSelect: () => {
      clipInteraction.clear();
      locatorInteraction.select(undefined);
    },
  });

  function clearSelection() {
    const hadSelection =
      clipInteraction.hasSelection ||
      locatorInteraction.selectedId !== undefined ||
      midiInteraction.hasSelection;
    clipInteraction.clear();
    locatorInteraction.select(undefined);
    midiInteraction.clear();
    return hadSelection;
  }

  function deleteSelection() {
    if (clipInteraction.hasSelection) {
      clipInteraction.removeSelected();
    } else if (locatorInteraction.selectedId !== undefined) {
      locatorInteraction.removeSelected();
    } else if (midiInteraction.hasSelection) {
      midiInteraction.removeSelected();
    } else {
      return false;
    }
    return true;
  }

  const historyMutation = useMutation({
    mutationFn: (direction: "undo" | "redo") => runtime[direction](),
  });

  function handleUndoRedoShortcut(event: KeyboardEvent): boolean {
    const undo = matchKeyboardEvent(event, "Ctrl+Z");
    const redo =
      matchKeyboardEvent(event, "Ctrl+Shift+Z") ||
      matchKeyboardEvent(event, "Ctrl+Y");
    if (!undo && !redo) {
      return false;
    }
    clearSelection();
    historyMutation.mutate(undo ? "undo" : "redo");
    return true;
  }

  return {
    clipInteraction,
    locatorInteraction,
    midiInteraction,
    clearSelection,
    deleteSelection,
    handleUndoRedoShortcut,
  };
}
