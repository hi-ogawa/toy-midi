import type { RuntimeState } from "../lib/runtime";
import type { UseProjectResult } from "./use-project";

export interface EditorFlags {
  /** Covers the stop tail too, since the take lands only after the worklet finalizes. */
  isRecording: boolean;
  transportDisabled: boolean;
  recordBlocker?: "arm" | "input";
  saveDisabled: boolean;
}

export function deriveEditorFlags({
  state,
  project,
}: {
  state: RuntimeState;
  project: UseProjectResult;
}): EditorFlags {
  const { captureStatus, armedTrackId } = state;
  const isRecording =
    captureStatus === "recording" || captureStatus === "processing";
  return {
    isRecording,
    transportDisabled: !project.ready,
    recordBlocker: isRecording
      ? undefined
      : !armedTrackId
        ? "arm"
        : captureStatus === "disabled"
          ? "input"
          : undefined,
    saveDisabled:
      !project.ready || !project.dirty || project.saving || isRecording,
  };
}
