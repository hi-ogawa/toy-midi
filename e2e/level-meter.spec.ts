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

  // Meters rest at the bottom of the scale while stopped.
  await expect(trackMeter).toHaveAttribute("aria-valuenow", "-60");
  await expect(masterMeter).toHaveAttribute("aria-valuenow", "-60");

  // Play, and both the track and the master meter rise.
  await page.getByTestId("play-button").click();
  await expect.poll(() => getLevel(trackMeter)).toBeGreaterThan(-60);
  await expect.poll(() => getLevel(masterMeter)).toBeGreaterThan(-60);

  // Mute the track, and its meter falls back, because it reads after the fader.
  await panel.getByRole("button", { name: "Toggle Audio 2 mute" }).click();
  await expect(trackMeter).toHaveAttribute("aria-valuenow", "-60");
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

  // Play the restored notes, and the track meter rises.
  await page.getByTestId("mixer-button").click();
  const trackMeter = page
    .getByTestId("mixer-panel")
    .getByRole("meter", { name: "MIDI 1 level" });
  await page.getByTestId("play-button").click();
  await expect.poll(() => getLevel(trackMeter)).toBeGreaterThan(-60);
});
