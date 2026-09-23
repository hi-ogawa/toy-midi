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
  armedTrackId,
  project,
}: {
  captureStatus: RecorderRuntimeState["captureStatus"];
  armedTrackId: RecorderRuntimeState["armedTrackId"];
  project: UseRecorderProjectResult;
}): RecorderFlags {
  const isRecording =
    captureStatus === "recording" || captureStatus === "processing";
  return {
    isRecording,
    // Play and record stay enabled while recording because both act as stop.
    playDisabled: !project.ready,
    // Recording needs both an open input and an armed destination.
    recordDisabled:
      !project.ready ||
      (!isRecording && (captureStatus === "disabled" || !armedTrackId)),
    saveDisabled:
      !project.ready || !project.dirty || project.saving || isRecording,
  };
}
