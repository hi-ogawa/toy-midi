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
  // Create Untitled and save it with C4, backing audio, and a distinct tempo.
  await createProject(page);
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Untitled",
  );
  const firstUrl = page.url();
  await addAudio(page, "e2e/fixtures/test-audio.wav");
  await expect(page.getByTestId("recorder-audio-track-row")).toHaveCount(2);
  await expect(page.getByTestId("recorder-clip-audio")).toHaveCount(1);
  let row = await addMidiTrack(page);
  await createMidiNote(page, row, { beat: 0, pitch: "C4" });
  const tempo = page.getByTestId("recorder-tempo-input");
  await tempo.fill("90");
  await tempo.press("Enter");
  await saveProject(page);

  // Create Untitled 2 and save it with E4 and its own tempo, without inheriting audio.
  await createProject(page);
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Untitled 2",
  );
  const secondUrl = page.url();
  expect(secondUrl).not.toBe(firstUrl);
  await expect(page.getByTestId("recorder-audio-track-row")).toHaveCount(1);
  await expect(page.getByTestId("recorder-clip-audio")).toHaveCount(0);
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
  await expect(page.getByTestId("recorder-audio-track-row")).toHaveCount(1);
  await expect(page.getByTestId("recorder-clip-audio")).toHaveCount(0);
  await expect(tempo).toHaveValue("140");
});
