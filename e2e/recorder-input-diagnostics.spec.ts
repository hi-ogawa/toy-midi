import { expect, test } from "@playwright/test";
import { useFakeAudioInput } from "./helpers";
import { createRecorderProject } from "./recorder-helpers";

useFakeAudioInput();

test("inspect live editor input diagnostics", async ({ page }) => {
  // Open diagnostic readings without activating capture or assuming missing latency is zero.
  await createRecorderProject(page);
  await page.getByRole("button", { name: "Configure audio input" }).click();
  const setup = page.getByTestId("recorder-input-setup");
  const readings = setup.getByRole("region", {
    name: "Audio diagnostic readings",
  });
  await expect(readings).toHaveCount(0);
  await setup.getByText("Audio diagnostics", { exact: true }).click();
  await expect(readings).toContainText("Input disabled");
  await expect(
    readings.locator("dt", { hasText: "Context sample rate" }).locator("+ dd"),
  ).toHaveText(/^[1-9]\d* Hz$/);

  await expect(
    readings
      .locator("dt", { hasText: "Base + Output + Input" })
      .locator("+ dd"),
  ).toHaveText("Unavailable");

  // Enable capture and show settings from the active input.
  await setup
    .getByRole("button", { name: "Enable input", exact: true })
    .click();
  await expect(readings).toContainText("Fake Default Audio Input");
  await expect(
    readings.locator("dt", { hasText: /^Sample rate$/ }).locator("+ dd"),
  ).toHaveText(/^[1-9]\d* Hz$/);
  await expect(
    readings.locator("dt", { hasText: "Echo cancellation" }).locator("+ dd"),
  ).toHaveText("Off");

  // Disable capture and remove stale input readings.
  await setup
    .getByRole("button", { name: "Disable input", exact: true })
    .click();
  await expect(readings).toContainText("Input disabled");
  await expect(
    readings
      .locator("dt", { hasText: "Base + Output + Input" })
      .locator("+ dd"),
  ).toHaveText("Unavailable");
  await expect(readings).not.toContainText("Fake Default Audio Input");
});
