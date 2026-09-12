import type { RecorderRuntimeState } from "../../lib/recorder/runtime";

export interface RecorderFlags {
  /** Covers the stop tail too, since the take lands only after the worklet finalizes. */
  isRecording: boolean;
  playDisabled: boolean;
  recordDisabled: boolean;
  saveDisabled: boolean;
}

export function deriveRecorderFlags({
  captureStatus,
  project,
}: {
  captureStatus: RecorderRuntimeState["captureStatus"];
  project: { loaded: boolean; dirty: boolean; saving: boolean };
}): RecorderFlags {
  const isRecording =
    captureStatus === "recording" || captureStatus === "processing";
  return {
    isRecording,
    // Play and record stay enabled while recording because both act as stop.
    playDisabled: !project.loaded,
    recordDisabled: !project.loaded || captureStatus === "disabled",
    saveDisabled:
      !project.loaded || !project.dirty || project.saving || isRecording,
  };
}
