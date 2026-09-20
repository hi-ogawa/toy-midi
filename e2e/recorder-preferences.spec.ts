import { expect, test } from "@playwright/test";
import { useFakeAudioInput } from "./helpers";
import { createRecorderProject, enableInput } from "./recorder-helpers";

useFakeAudioInput();

test("input edits preserve newer timeline preferences across projects", async ({
  page,
}) => {
  // Open input setup so its remembered settings exist before changing the timeline.
  await createRecorderProject(page);
  await enableInput(page);

  // Choose a different device to establish remembered input settings.
  const configureInput = page.getByRole("button", {
    name: "Configure audio input",
  });
  const setup = page.getByTestId("recorder-input-setup");
  await configureInput.click();
  const device = page.getByLabel("Device");
  const nextDevice = await device
    .locator("option")
    .nth(1)
    .getAttribute("value");
  expect(nextDevice).toBeTruthy();
  await expect(device).not.toHaveValue(nextDevice!);
  await device.selectOption(nextDevice!);
  await setup
    .getByRole("button", { name: "Enable input", exact: true })
    .click();
  await expect(
    setup.getByRole("button", { name: "Disable input", exact: true }),
  ).toBeVisible();
  await setup.getByRole("button", { name: "Close", exact: true }).click();

  // Disable auto-scroll, then commit a different latency compensation value.
  const autoScroll = page.getByRole("button", {
    name: "Toggle auto-scroll (F)",
  });
  await autoScroll.click();
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");
  await configureInput.click();
  const latency = setup.getByRole("textbox");
  await expect(latency).toHaveValue("0");
  await latency.fill("50");
  await latency.press("Enter");
  await expect(latency).toHaveValue("50");
  await page
    .getByTestId("recorder-input-setup")
    .getByRole("button", { name: "Close", exact: true })
    .click();

  // Reload to verify the persisted preference, then carry it into another project.
  await page.reload();
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");
  await configureInput.click();
  await setup
    .getByRole("button", { name: "Enable input", exact: true })
    .click();
  await expect(latency).toHaveValue("50");
  await setup.getByRole("button", { name: "Close", exact: true }).click();
  await createRecorderProject(page);
  await expect(autoScroll).toHaveAttribute("aria-pressed", "false");
});
