import { expect, test, type Locator } from "@playwright/test";
import {
  addAudio,
  addMidiTrack,
  createMidiNote,
  createProject,
  saveProject,
} from "./editor-helpers";

async function getLevel(meter: Locator): Promise<number> {
  return Number(await meter.getAttribute("aria-valuenow"));
}

test("meters playback levels after the fader", async ({ page }) => {
  await createProject(page);

  // Load backing audio and open the mixer.
  await addAudio(page, "e2e/fixtures/test-audio.wav");
  await page.getByTestId("mixer-button").click();
  const panel = page.getByTestId("mixer-panel");
  const trackMeter = panel.getByRole("meter", { name: "Audio 2 level" });
  const masterMeter = panel.getByRole("meter", { name: "Master level" });
  const trackLed = page
    .getByTestId("audio-track-row")
    .filter({ hasText: "Audio 2" })
    .getByTestId("track-activity");

  // Meters rest at the bottom of the scale and the header LED stays dark while stopped.
  await expect(trackMeter).toHaveAttribute("aria-valuenow", "-60");
  await expect(masterMeter).toHaveAttribute("aria-valuenow", "-60");
  await expect(trackLed).toHaveAttribute("data-active", "false");

  // Play, and both the track and the master meter rise while the header LED lights.
  await page.getByTestId("play-button").click();
  await expect.poll(() => getLevel(trackMeter)).toBeGreaterThan(-60);
  await expect.poll(() => getLevel(masterMeter)).toBeGreaterThan(-60);
  await expect(trackLed).toHaveAttribute("data-active", "true");

  // Mute the track, and its meter and LED fall back, because they read after the fader.
  await panel.getByRole("button", { name: "Toggle Audio 2 mute" }).click();
  await expect(trackMeter).toHaveAttribute("aria-valuenow", "-60");
  await expect(trackLed).toHaveAttribute("data-active", "false");
});

test("meters MIDI track playback", async ({ page }) => {
  // Write a bar of C4 quarter notes on a new MIDI track, then save and reload
  // so the previews of the new notes don't reach the meter.
  await createProject(page);
  const row = await addMidiTrack(page);
  for (const beat of [0, 1, 2, 3]) {
    await createMidiNote(page, row, { beat, pitch: "C4" });
  }
  await saveProject(page);
  await page.reload();

  // Play the restored notes, and the track meter and header LED rise.
  await page.getByTestId("mixer-button").click();
  const trackMeter = page
    .getByTestId("mixer-panel")
    .getByRole("meter", { name: "MIDI 1 level" });
  await page.getByTestId("play-button").click();
  await expect.poll(() => getLevel(trackMeter)).toBeGreaterThan(-60);
  await expect(row.getByTestId("track-activity")).toHaveAttribute(
    "data-active",
    "true",
  );
});
