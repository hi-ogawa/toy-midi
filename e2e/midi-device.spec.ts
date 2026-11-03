import { expect, test } from "@playwright/test";
import { addMidiTrack, createProject, saveProject } from "./editor-helpers";
import { installFakeMidiDevice, tapMasterOutput } from "./helpers";

test.use({ permissions: ["midi"] });

test("plays the monitored MIDI track from a MIDI device", async ({ page }) => {
  const device = await installFakeMidiDevice(page);
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

  // Monitor the first track, hold a note, and hear it through that track, so
  // muting it silences it.
  const output = await tapMasterOutput(page);
  await firstMonitor.click();
  await expect(firstMonitor).toHaveAttribute("aria-pressed", "true");
  await device.send([0x90, 60, 100]);
  await output.expectSound();
  await first.getByTitle("Mute MIDI 1", { exact: true }).click();
  await output.expectSilence();
  await first.getByTitle("Unmute MIDI 1", { exact: true }).click();
  await output.expectSound();

  // Move monitoring while the note is held, and hear the note end.
  await secondMonitor.click();
  await expect(firstMonitor).toHaveAttribute("aria-pressed", "false");
  await expect(secondMonitor).toHaveAttribute("aria-pressed", "true");
  await output.expectSilence();
  await device.send([0x80, 60, 0]);

  // Play the second track, releasing with a note-on at velocity 0.
  await device.send([0x91, 64, 100]);
  await output.expectSound();
  await device.send([0x91, 64, 0]);
  await output.expectSilence();

  // Save and reload, and find the device reconnected with monitoring off.
  await saveProject(page);
  await page.reload();
  await expect(firstMonitor).toBeVisible();
  await expect(secondMonitor).toHaveAttribute("aria-pressed", "false");
});
