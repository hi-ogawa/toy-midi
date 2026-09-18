import { expect, test } from "@playwright/test";
import {
  createRecorderProject,
  addRecorderMidiTrack,
  createRecorderMidiNote,
} from "./recorder-helpers";

test("renders a MIDI note in the score panel", async ({ page }) => {
  // Create a MIDI track and add a C4 note at the first beat.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack({ page });
  const note = await createRecorderMidiNote({
    page,
    track: row,
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

  // Close the score preview and verify the panel disappears.
  await page
    .getByRole("button", {
      name: "Close score preview for MIDI 1",
      exact: true,
    })
    .click();
  await expect(score).toHaveCount(0);
});
