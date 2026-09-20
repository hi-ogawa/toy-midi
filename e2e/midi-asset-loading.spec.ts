import { expect, test } from "@playwright/test";
import {
  addRecorderMidiTrack,
  createRecorderProject,
} from "./recorder-helpers";

test("shows asset loading only when MIDI is requested before preload finishes", async ({
  page,
}) => {
  // Hold the startup soundfont preload and keep background loading silent.
  const releaseSoundfont = Promise.withResolvers<void>();
  const soundfontRequested = Promise.withResolvers<void>();
  await page.route(/\/[^/]*A320U[^/]*\.sf2(?:\?.*)?$/, async (route) => {
    soundfontRequested.resolve();
    await releaseSoundfont.promise;
    await route.continue();
  });
  await createRecorderProject(page);
  await soundfontRequested.promise;
  const loading = page.getByText("Loading MIDI soundfont…", { exact: true });
  // Observe beyond the 300 ms feedback delay while no MIDI has been requested.
  await page.waitForTimeout(500);
  await expect(loading).not.toBeVisible();

  // Request MIDI while the download is pending and show one global indicator.
  await page.getByTestId("recorder-add-midi-track").click();
  await expect(loading).toBeVisible();
  await expect(loading).toHaveCount(1);
  await expect(page.getByTestId("recorder-midi-track-row")).toHaveCount(0);

  // Finish the download and replace the loading feedback with the ready track.
  releaseSoundfont.resolve();
  await expect(page.getByTestId("recorder-midi-track-row")).toHaveCount(1);
  await expect(loading).not.toBeVisible();

  // Add another MIDI track with ready assets and keep the indicator hidden.
  await addRecorderMidiTrack(page);
  await page.waitForTimeout(500);
  await expect(loading).not.toBeVisible();
});

test("keeps MIDI demand quiet after the background preload finishes", async ({
  page,
}) => {
  // Finish the soundfont preload before requesting any MIDI track.
  await createRecorderProject(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .some((entry) => /\/[^/]*A320U[^/]*\.sf2(?:\?.*)?$/.test(entry.name)),
      ),
    )
    .toBe(true);
  const loading = page.getByText("Loading MIDI soundfont…", { exact: true });
  await expect(loading).not.toBeVisible();

  // Add a track with preloaded assets and wait past the feedback delay.
  await addRecorderMidiTrack(page);
  await page.waitForTimeout(500);
  await expect(loading).not.toBeVisible();
});
