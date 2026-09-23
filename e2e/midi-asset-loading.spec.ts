import { expect, test } from "@playwright/test";
import { createRecorderProject } from "./recorder-helpers";

test("shows loading feedback while adding MIDI waits for the soundfont", async ({
  page,
}) => {
  // Hold the startup soundfont preload so adding MIDI must wait for it.
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

  // Request MIDI while the download is pending and show one global indicator.
  await page.getByTestId("recorder-add-midi-track").click();
  await expect(loading).toBeVisible();
  await expect(loading).toHaveCount(1);
  await expect(page.getByTestId("recorder-midi-track-row")).toHaveCount(0);

  // Finish the download and replace the loading feedback with the ready track.
  releaseSoundfont.resolve();
  await expect(page.getByTestId("recorder-midi-track-row")).toHaveCount(1);
  await expect(loading).not.toBeVisible();
});
