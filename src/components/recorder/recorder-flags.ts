import type { RecorderRuntimeState } from "../../lib/recorder/runtime";

export interface RecorderFlags {
  isRecording: boolean;
  isProcessing: boolean;
  /** Capture owns the transport, so seeking, transport edits, and input changes wait. */
  captureBusy: boolean;
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
  const isRecording = captureStatus === "recording";
  const isProcessing = captureStatus === "processing";
  const captureBusy = isRecording || isProcessing;
  return {
    isRecording,
    isProcessing,
    captureBusy,
    // Play stays enabled while recording because it doubles as stop.
    playDisabled: !project.loaded || isProcessing,
    recordDisabled:
      !project.loaded || isProcessing || captureStatus === "disabled",
    saveDisabled:
      !project.loaded || !project.dirty || project.saving || captureBusy,
  };
}
