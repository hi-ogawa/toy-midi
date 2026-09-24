import type { RecorderRuntimeState } from "../../lib/recorder/runtime";
import type { UseRecorderProjectResult } from "./use-recorder-project";

export interface RecorderFlags {
  /** Covers the stop tail too, since the take lands only after the worklet finalizes. */
  isRecording: boolean;
  transportDisabled: boolean;
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
    // Both buttons stop recording. Record also explains missing prerequisites.
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
