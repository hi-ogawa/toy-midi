import { expect, test } from "@playwright/test";
import { selectMenuItem } from "./helpers";
import {
  createRecorderProject,
  addRecorderMidiTrack,
  createRecorderMidiNote,
  saveRecorderProject,
  getRecorderBeat,
  seekRecorderByPixels,
} from "./recorder-helpers";

test("previews a MIDI note and opens its saved score in the viewer", async ({
  page,
}) => {
  // Create a MIDI track and add a C4 note at the first beat.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  const note = await createRecorderMidiNote(page, row, {
    beat: 0,
    pitch: "C4",
  });
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1");

  // Open the score preview and verify the note renders as notation.
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Score preview" });
  const score = page.getByTestId("recorder-score-preview");
  await expect(score).toHaveCount(1);
  await expect(
    score.getByTestId("score-viewer-renderer").locator("svg"),
  ).toBeVisible();

  // Keep the score viewer link disabled until the project is saved.
  const openScore = score.getByRole("link", { name: "Open score viewer" });
  await expect(openScore).toBeDisabled();
  await openScore.hover();
  const tooltip = score.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveCSS("opacity", "1");
  await expect(tooltip).toHaveText("Please save before opening score view");

  // Save the project and open its track in the score viewer.
  await saveRecorderProject(page);
  await expect(openScore).toBeEnabled();
  const popupPromise = page.waitForEvent("popup");
  await openScore.click();
  const scorePage = await popupPromise;
  await expect(scorePage.getByTestId("score-name")).toHaveText(
    "Untitled - MIDI 1.musicxml",
  );
  await expect(
    scorePage.getByTestId("score-viewer-renderer").locator("svg"),
  ).toBeVisible();
  await scorePage.close();

  // Close the score preview and verify the panel disappears.
  await page
    .getByRole("button", {
      name: "Close score preview for MIDI 1",
      exact: true,
    })
    .click();
  await expect(score).toHaveCount(0);
});

test("syncs seeking between the score preview and recorder timeline", async ({
  page,
}) => {
  // Place notes in the first and third measures so both seek targets render.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  await createRecorderMidiNote(page, row, { beat: 0, pitch: "C4" });
  await createRecorderMidiNote(page, row, { beat: 8, pitch: "E4" });
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Score preview" });
  const score = page.getByTestId("recorder-score-preview");
  const cursor = score.getByTestId("score-viewer-cursor");
  await expect(cursor).toBeVisible();
  const initial = await cursor.evaluate((element) => element.style.transform);

  // Click the third measure and move the recorder transport to its starting beat.
  await score
    .locator('[data-measure-index="2"]')
    .click({ position: { x: 20, y: 20 } });
  await expect.poll(() => getRecorderBeat(page)).toBe(8);
  await expect
    .poll(() => cursor.evaluate((element) => element.style.transform))
    .not.toBe(initial);

  // Seek back from the timeline and restore the first-measure score cursor.
  await seekRecorderByPixels(page, 0);
  await expect.poll(() => getRecorderBeat(page)).toBe(0);
  await expect
    .poll(() => cursor.evaluate((element) => element.style.transform))
    .toBe(initial);
});
