import { expect, test } from "@playwright/test";
import {
  createRecorderProject,
  addRecorderMidiTrack,
  createRecorderMidiNote,
  saveRecorderProject,
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
  await page
    .getByRole("button", { name: "MIDI 1 actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Score preview", exact: true })
    .click();
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
    "Untitled project · MIDI 1.musicxml",
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
