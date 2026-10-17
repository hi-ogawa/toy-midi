import { expect, test } from "@playwright/test";
import { createProject } from "./editor-helpers";

test("adds MIDI tracks while the soundfont loads and shows loading feedback", async ({
  page,
}) => {
  // Hold the startup soundfont download.
  const releaseSoundfont = Promise.withResolvers<void>();
  const soundfontRequested = Promise.withResolvers<void>();
  await page.route(
    /\/[^/]*GeneralUserGS[^/]*\.sf3(?:\?.*)?$/,
    async (route) => {
      soundfontRequested.resolve();
      await releaseSoundfont.promise;
      await route.continue();
    },
  );
  await createProject(page);
  await soundfontRequested.promise;
  const loading = page.getByText("Loading GeneralUser GS SoundFont…", {
    exact: true,
  });

  // Add two MIDI tracks while the download is pending. They appear right away,
  // under one indicator.
  await page.getByTestId("add-midi-track").click();
  await page.getByTestId("add-midi-track").click();
  await expect(page.getByTestId("midi-track-row")).toHaveCount(2);
  await expect(loading).toBeVisible();
  await expect(loading).toHaveCount(1);

  // Finish the download, which dismisses the loading feedback.
  releaseSoundfont.resolve();
  await expect(loading).not.toBeVisible();
});
