import { expect, test } from "@playwright/test";
import {
  createMidiNote,
  createProject,
  playAndExpectTrackAudible,
} from "./editor-helpers";

test("adds MIDI tracks while the soundfont loads and plays them once it arrives", async ({
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
  // under one indicator, and accept notes.
  await page.getByTestId("add-midi-track").click();
  await page.getByTestId("add-midi-track").click();
  const rows = page.getByTestId("midi-track-row");
  await expect(rows).toHaveCount(2);
  await expect(loading).toBeVisible();
  await expect(loading).toHaveCount(1);
  for (const beat of [0, 1, 2, 3]) {
    await createMidiNote(page, rows.first(), { beat, pitch: "C4" });
  }

  // Finish the download and dismiss the loading feedback.
  releaseSoundfont.resolve();
  await expect(loading).not.toBeVisible();

  // Play, and hear the track that was written before the soundfont arrived.
  await playAndExpectTrackAudible(page, { name: "MIDI 1" });
});
