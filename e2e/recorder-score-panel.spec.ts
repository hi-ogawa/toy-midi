import { expect, test } from "@playwright/test";
import { createRecorderProject } from "./recorder-helpers";

test("opens and closes an empty score panel", async ({ page }) => {
  // Open a MIDI score and verify its empty state.
  await createRecorderProject(page);
  await page.getByTestId("recorder-add-midi-track").click();
  await page
    .getByRole("button", { name: "MIDI 1 actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Score preview", exact: true })
    .click();
  const score = page.getByTestId("recorder-score-preview");
  await expect(score).toHaveCount(1);
  await expect(score).toContainText("Add a note to preview the score.");

  // Close the score preview and verify the panel disappears.
  await page
    .getByRole("button", {
      name: "Close score preview for MIDI 1",
      exact: true,
    })
    .click();
  await expect(score).toHaveCount(0);
});
