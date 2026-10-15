import { expect, test, type Locator } from "@playwright/test";
import { addAudio, createProject } from "./editor-helpers";

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
