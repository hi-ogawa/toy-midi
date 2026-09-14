import { expect, test } from "@playwright/test";
import { useFakeAudioInput } from "./helpers";
import { createRecorderProject, enableInput } from "./recorder-helpers";

// Loop the 3-second 440 Hz fixture throughout the test.
useFakeAudioInput({ audioFilePath: "e2e/fixtures/test-audio.wav" });

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
