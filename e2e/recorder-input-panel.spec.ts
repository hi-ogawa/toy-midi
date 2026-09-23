import { expect, test } from "@playwright/test";
import { useFakeAudioInput } from "./helpers";
import { createRecorderProject } from "./recorder-helpers";

useFakeAudioInput();

test("controls the audio input from the input panel", async ({ page }) => {
  // Open the input panel from the header.
  await createRecorderProject(page);
  const panelButton = page.getByTestId("recorder-input-panel-button");
  const panel = page.getByTestId("recorder-input-panel");
  await expect(panel).toHaveCount(0);
  await panelButton.click();
  await expect(panelButton).toHaveAttribute("aria-pressed", "true");
  await expect(
    panel.getByRole("heading", { name: "Audio Input", exact: true }),
  ).toBeVisible();

  // Turn the input on and see Capture monitoring become available.
  const route = panel.getByTitle("Audio input setup");
  await expect(route).toContainText("Fake Default Audio Input · Channel 1");
  await panel.getByRole("button", { name: "Turn input on" }).click();
  await expect(
    panel.getByRole("button", { name: "Turn input off" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("recorder-input-monitor")).toBeEnabled();

  // Open the tuner as its own panel from the input panel.
  await panel.getByRole("button", { name: "Tuner" }).click();
  await expect(page.getByTestId("recorder-tuner-panel")).toBeVisible();

  // Open input setup from the route field.
  await route.click();
  const setup = page.getByTestId("recorder-input-setup");
  await expect(
    setup.getByRole("heading", { name: "Audio Input Setup" }),
  ).toBeVisible();
  await setup.getByRole("button", { name: "Close", exact: true }).click();

  // Turn the input off, then close the panel from the header.
  await panel.getByRole("button", { name: "Turn input off" }).click();
  await expect(page.getByTestId("recorder-input-monitor")).toBeDisabled();
  await panelButton.click();
  await expect(panel).toHaveCount(0);
});
