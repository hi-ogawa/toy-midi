import type { RecorderRuntimeState } from "../../lib/recorder/runtime";
import type { UseRecorderProjectResult } from "./use-recorder-project";

export interface RecorderFlags {
  /** Covers the stop tail too, since the take lands only after the worklet finalizes. */
  isRecording: boolean;
  playDisabled: boolean;
  recordDisabled: boolean;
  /** The missing step before recording can start. */
  recordBlocker?: "arm" | "input";
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
    // Record stays clickable without input or an armed track so the click can
    // explain the missing step instead of silently doing nothing.
    recordDisabled: !project.ready,
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
