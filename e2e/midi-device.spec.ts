import { expect, test, type Page } from "@playwright/test";
import {
  addMidiTrack,
  createProject,
  openMidiInstrument,
  saveProject,
  selectMidiInstrument,
} from "./editor-helpers";

declare global {
  interface Window {
    sendFakeMidi: (bytes: number[]) => void;
    setFakeMidiState: (state: "connected" | "disconnected") => void;
  }
}

test.use({ permissions: ["midi"] });

// Playwright has no virtual MIDI device, so this replaces the browser's access.
async function installFakeMidiDevice(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const input = {
      id: "fake-keyboard",
      name: "Fake Keyboard",
      state: "connected",
      onmidimessage: undefined as
        | ((event: { data: Uint8Array }) => void)
        | undefined,
      close: async () => input,
    };
    const access = {
      inputs: new Map([[input.id, input]]),
      onstatechange: undefined as (() => void) | undefined,
    };
    navigator.requestMIDIAccess = async () => access as unknown as MIDIAccess;
    window.sendFakeMidi = (bytes) =>
      input.onmidimessage?.({ data: new Uint8Array(bytes) });
    window.setFakeMidiState = (state) => {
      input.state = state;
      access.onstatechange?.();
    };
  });
}

async function addSynthTrack(page: Page, name: string) {
  const row = await addMidiTrack(page);
  const instrument = await openMidiInstrument(page, { name });
  await selectMidiInstrument(instrument, { option: "Subtractive Synth" });
  await instrument.getByRole("button", { name: "Close", exact: true }).click();
  return row;
}

test("plays the monitored MIDI track from a MIDI device", async ({ page }) => {
  await installFakeMidiDevice(page);
  await createProject(page);

  // Add two synth tracks, which offer no monitoring without a device.
  const first = await addSynthTrack(page, "MIDI 1");
  const second = await addSynthTrack(page, "MIDI 2");
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

  // Hold a note before monitoring, and hear nothing.
  await page.getByTestId("mixer-button").click();
  const mixer = page.getByTestId("mixer-panel");
  const firstMeter = mixer.getByRole("meter", { name: "MIDI 1 level" });
  const secondMeter = mixer.getByRole("meter", { name: "MIDI 2 level" });
  const getLevel = async (meter: typeof firstMeter) =>
    Number(await meter.getAttribute("aria-valuenow"));
  await page.evaluate(() => window.sendFakeMidi([0x90, 60, 100]));
  await page.evaluate(() => window.sendFakeMidi([0x80, 60, 0]));
  await expect(firstMeter).toHaveAttribute("aria-valuenow", "-60");

  // Monitor the first track, hold a note, and hear it on that track only.
  await firstMonitor.click();
  await page.evaluate(() => window.sendFakeMidi([0x90, 60, 100]));
  await expect.poll(() => getLevel(firstMeter)).toBeGreaterThan(-60);
  await expect(secondMeter).toHaveAttribute("aria-valuenow", "-60");

  // Move monitoring while the note is held, and hear the note end.
  await secondMonitor.click();
  await expect(firstMonitor).toHaveAttribute("aria-pressed", "false");
  await expect(firstMeter).toHaveAttribute("aria-valuenow", "-60");
  await page.evaluate(() => window.sendFakeMidi([0x80, 60, 0]));

  // Play the second track, releasing with a note-on at velocity 0.
  await page.evaluate(() => window.sendFakeMidi([0x91, 64, 100]));
  await expect.poll(() => getLevel(secondMeter)).toBeGreaterThan(-60);
  await page.evaluate(() => window.sendFakeMidi([0x91, 64, 0]));
  await expect(secondMeter).toHaveAttribute("aria-valuenow", "-60");

  // Unplug the device while holding a note, and hear the note end.
  await page.evaluate(() => window.sendFakeMidi([0x90, 67, 100]));
  await expect.poll(() => getLevel(secondMeter)).toBeGreaterThan(-60);
  await page.evaluate(() => window.setFakeMidiState("disconnected"));
  await expect(secondMeter).toHaveAttribute("aria-valuenow", "-60");
  await expect(secondMonitor).toHaveCount(0);

  // Plug it back in, and find it reconnected with monitoring off.
  await page.evaluate(() => window.setFakeMidiState("connected"));
  await expect(secondMonitor).toHaveAttribute("aria-pressed", "false");

  // Save and reload, and find the device reconnected with monitoring off.
  await saveProject(page);
  await page.reload();
  await expect(firstMonitor).toBeVisible();
  await expect(secondMonitor).toHaveAttribute("aria-pressed", "false");
});
