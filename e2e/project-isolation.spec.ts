import { expect, test } from "@playwright/test";
import {
  addAudio,
  addMidiTrack,
  createMidiNote,
  createProject,
  getMidiNote,
  saveProject,
} from "./editor-helpers";

test("keeps notes, audio, and tempo isolated between saved projects", async ({
  page,
}) => {
  // Save the first project with C4, backing audio, and a distinct tempo.
  await createProject(page);
  const firstUrl = page.url();
  await addAudio(page, "e2e/fixtures/test-audio.wav");
  let row = await addMidiTrack(page);
  await createMidiNote(page, row, { beat: 0, pitch: "C4" });
  const tempo = page.getByTestId("recorder-tempo-input");
  await tempo.fill("90");
  await tempo.press("Enter");
  await saveProject(page);

  // Save another project with E4 and its own tempo, without inheriting audio.
  await createProject(page);
  const secondUrl = page.url();
  expect(secondUrl).not.toBe(firstUrl);
  await expect(page.getByTestId("recorder-audio-track-row")).toHaveCount(0);
  await expect(page.getByTestId("recorder-midi-track-row")).toHaveCount(0);
  await expect(tempo).toHaveValue("120");
  row = await addMidiTrack(page);
  await createMidiNote(page, row, { beat: 1, pitch: "E4" });
  await tempo.fill("140");
  await tempo.press("Enter");
  await saveProject(page);

  // Reopen each saved URL and recover only that project's content.
  await page.goto(firstUrl);
  row = page.getByTestId("recorder-midi-track-row");
  await expect(row.locator("[data-note-id]")).toHaveCount(1);
  await expect(getMidiNote(row, { beat: 0, pitch: "C4" })).toBeVisible();
  await expect(
    page.getByTestId("recorder-clip-audio").locator("svg"),
  ).toBeVisible();
  await expect(tempo).toHaveValue("90");
  await page.goto(secondUrl);
  await expect(row.locator("[data-note-id]")).toHaveCount(1);
  await expect(getMidiNote(row, { beat: 1, pitch: "E4" })).toBeVisible();
  await expect(page.getByTestId("recorder-audio-track-row")).toHaveCount(0);
  await expect(tempo).toHaveValue("140");
});
