import { expect, test } from "@playwright/test";
import { createRecorderProject } from "./recorder-helpers";

test("renders a MIDI note in the score panel", async ({ page }) => {
  // Create a MIDI track and add a C4 note at the first beat.
  await createRecorderProject(page);
  await page.getByTestId("recorder-add-midi-track").click();
  const row = page.getByTestId("recorder-midi-track-row");
  const grid = row.getByTestId("recorder-midi-grid");
  const key = row.getByRole("button", { name: "Preview C4", exact: true });
  await expect(grid).toBeVisible();
  const gridBox = (await grid.boundingBox())!;
  const keyBox = (await key.boundingBox())!;
  await page.mouse.click(gridBox.x + 5, keyBox.y + keyBox.height / 2);
  await expect(grid.locator("[data-note-id]")).toHaveAttribute(
    "aria-label",
    "C4, beat 1",
  );

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
  await expect(score.getByText("Loading score…", { exact: true })).toBeHidden();

  // Close the score preview and verify the panel disappears.
  await page
    .getByRole("button", {
      name: "Close score preview for MIDI 1",
      exact: true,
    })
    .click();
  await expect(score).toHaveCount(0);
});
