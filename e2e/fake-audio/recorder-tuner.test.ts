import path from "node:path";
import { expect, test } from "@playwright/test";
import { createRecorderProject, enableInput } from "./recorder-helpers";

test.use({
  launchOptions: {
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      // Chromium loops the WAV as microphone input by default (%noloop plays once),
      // so the 3-second 440 Hz fixture remains available throughout the test.
      // https://chromium.googlesource.com/chromium/src.git/+/cc79060bcce11b0cb6fafa673a2a20dcb12bd077/media/base/media_switches.cc
      `--use-file-for-fake-audio-capture=${path.resolve("e2e/fixtures/test-audio.wav")}`,
    ],
  },
});

test("opens the tuner and detects the input pitch", async ({ page }) => {
  // Open the tuner before enabling input and show the no-signal state.
  await createRecorderProject(page);
  await page.getByRole("button", { name: "Open tuner", exact: true }).click();
  const panel = page.getByTestId("recorder-tuner-panel");
  await expect(panel.getByText("No signal", { exact: true })).toBeVisible();

  // Enable the 440 Hz input and detect A4 without enabling monitoring.
  await enableInput(page);
  await expect(panel.getByText("A4", { exact: true })).toBeVisible();
  await expect(panel.getByText("In tune", { exact: true })).toBeVisible();
  await expect(page.getByTestId("recorder-input-monitor")).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // Close the tuner and restore its inactive toggle.
  await panel.getByRole("button", { name: "Close Tuner", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Open tuner", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});
