import { expect, test, type Page } from "@playwright/test";
import { addMidiTrack, createProject, saveProject } from "./editor-helpers";

test.use({ permissions: ["midi"] });

// Playwright has no virtual MIDI device, so this replaces the browser's access.
async function installFakeMidiDevice(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const setConnection = async (connection: string) => {
      input.connection = connection;
      access.dispatchEvent(new Event("statechange"));
      return input;
    };
    const input = Object.assign(new EventTarget(), {
      id: "fake-keyboard",
      name: "Fake Keyboard",
      state: "connected",
      connection: "closed",
      open: () => setConnection("open"),
      close: () => setConnection("closed"),
    });
    const access = Object.assign(new EventTarget(), {
      inputs: new Map([[input.id, input]]),
    });
    navigator.requestMIDIAccess = async () => access as unknown as MIDIAccess;
  });
}

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
