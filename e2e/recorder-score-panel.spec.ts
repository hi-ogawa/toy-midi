import { expect, test } from "@playwright/test";
import { createRecorderProject } from "./recorder-helpers";

test("opens one score panel independently of MIDI and Capture effects", async ({
  page,
}) => {
  // Open a MIDI score without any effects panels and verify its empty state.
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

  // Open MIDI and Capture effects and verify both appear without duplicating the score.
  await page
    .getByRole("button", { name: "MIDI 1 effects", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Capture effects", exact: true })
    .click();
  const effects = page.getByTestId("recorder-effects-panel");
  await expect(effects).toHaveCount(2);
  await expect(
    page.getByRole("heading", { name: "MIDI 1 Effects", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Capture Effects", exact: true }),
  ).toBeVisible();
  await expect(score).toHaveCount(1);

  // Close both effects panels and verify the score remains independently open.
  await page
    .getByRole("button", { name: "Close MIDI 1 Effects", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close Capture Effects", exact: true })
    .click();
  await expect(effects).toHaveCount(0);
  await expect(score).toBeVisible();
  await page
    .getByRole("button", {
      name: "Close score preview for MIDI 1",
      exact: true,
    })
    .click();
  await expect(score).toHaveCount(0);
});
