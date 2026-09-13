import type { RecorderRuntimeState } from "../../lib/recorder/runtime";
import type { UseRecorderProjectResult } from "./use-recorder-project";

export interface RecorderFlags {
  /** Covers the stop tail too, since the take lands only after the worklet finalizes. */
  isRecording: boolean;
  playDisabled: boolean;
  recordDisabled: boolean;
  saveDisabled: boolean;
}

export function deriveRecorderFlags({
  captureStatus,
  recordingArmed,
  project,
}: {
  captureStatus: RecorderRuntimeState["captureStatus"];
  recordingArmed: boolean;
  project: UseRecorderProjectResult;
}): RecorderFlags {
  const isRecording =
    captureStatus === "recording" || captureStatus === "processing";
  return {
    isRecording,
    // Play and record stay enabled while recording because both act as stop.
    playDisabled: !project.ready,
    recordDisabled:
      !project.ready ||
      (!isRecording && (captureStatus !== "ready" || !recordingArmed)),
    saveDisabled:
      !project.ready || !project.dirty || project.saving || isRecording,
  };
}
