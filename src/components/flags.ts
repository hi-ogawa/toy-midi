import type { EditorRuntimeState } from "../lib/runtime";
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
  state: EditorRuntimeState;
  project: UseProjectResult;
}): EditorFlags {
  const { captureStatus, armedTrackId } = state;
  const isRecording =
    captureStatus === "recording" || captureStatus === "processing";
  const canSave =
    project.ready &&
    !project.saving &&
    !isRecording &&
    // A draft saves as a new copy, so it saves even without edits.
    (project.dirty || project.draft);
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
    saveDisabled: !canSave,
  };
}
