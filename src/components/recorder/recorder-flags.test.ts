import { describe, expect, it } from "vitest";
import { deriveRecorderFlags } from "./recorder-flags";

const loaded = { loaded: true, dirty: true, saving: false };

describe("deriveRecorderFlags", () => {
  it("disables everything but display flags until the project is loaded", () => {
    expect(
      deriveRecorderFlags({
        captureStatus: "ready",
        project: { ...loaded, loaded: false },
      }),
    ).toMatchObject({
      captureBusy: false,
      playDisabled: true,
      recordDisabled: true,
      saveDisabled: true,
    });
  });

  it("keeps play enabled while recording so it can stop", () => {
    expect(
      deriveRecorderFlags({ captureStatus: "recording", project: loaded }),
    ).toMatchObject({
      isRecording: true,
      captureBusy: true,
      playDisabled: false,
      recordDisabled: false,
      saveDisabled: true,
    });
  });

  it("blocks play and record while processing", () => {
    expect(
      deriveRecorderFlags({ captureStatus: "processing", project: loaded }),
    ).toMatchObject({
      isProcessing: true,
      captureBusy: true,
      playDisabled: true,
      recordDisabled: true,
    });
  });

  it("disables record without an input and save without changes", () => {
    expect(
      deriveRecorderFlags({
        captureStatus: "disabled",
        project: { ...loaded, dirty: false },
      }),
    ).toMatchObject({
      playDisabled: false,
      recordDisabled: true,
      saveDisabled: true,
    });
  });
});
