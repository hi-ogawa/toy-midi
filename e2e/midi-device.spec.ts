import { expect, test } from "@playwright/test";
import { addMidiTrack, createProject, saveProject } from "./editor-helpers";
import { installFakeMidiDevice } from "./helpers";

test.use({ permissions: ["midi"] });

test("plays the monitored MIDI track from a MIDI device", async ({ page }) => {
  await installFakeMidiDevice(page);
  await createProject(page);

  // Add two MIDI tracks, which offer no monitoring without a device.
  const first = await addMidiTrack(page);
  const second = await addMidiTrack(page);
  const firstMonitor = first.getByTestId("input-monitor");
  const secondMonitor = second.getByTestId("input-monitor");
  await expect(firstMonitor).toHaveCount(0);

  // Open the MIDI device dialog from the editor menu, and select the device.
  await page.getByRole("button", { name: "Editor menu" }).click();
  await page.getByRole("menuitem", { name: "MIDI Device" }).click();
  const dialog = page.getByRole("dialog", { name: "MIDI Device" });
  await dialog.getByLabel("Device").selectOption("Fake Keyboard");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(firstMonitor).toBeVisible();

  // Monitor the first track.
  await firstMonitor.click();
  await expect(firstMonitor).toHaveAttribute("aria-pressed", "true");

  // Move monitoring to the second track.
  await secondMonitor.click();
  await expect(firstMonitor).toHaveAttribute("aria-pressed", "false");
  await expect(secondMonitor).toHaveAttribute("aria-pressed", "true");

  // Save and reload, and find the device reconnected with monitoring off.
  await saveProject(page);
  await page.reload();
  await expect(firstMonitor).toBeVisible();
  await expect(secondMonitor).toHaveAttribute("aria-pressed", "false");
});
