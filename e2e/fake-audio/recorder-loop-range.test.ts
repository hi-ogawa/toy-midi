import assert from "node:assert/strict";
import { expect, test } from "@playwright/test";
import { createRecorderProject, dragBy } from "./recorder-helpers";

test("creates and edits a persisted loop range", async ({ page }) => {
  await createRecorderProject(page);

  const toggle = page.getByTestId("recorder-loop-toggle");
  const range = page.getByTestId("recorder-loop-range");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(range).toHaveCount(0);

  // First activation creates and enables a loop range at the current bar.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(range).toBeVisible();
  const initialBox = await range.boundingBox();
  assert(initialBox);

  // Enabled playback returns to loop-in after reaching the end of the range.
  const playButton = page.getByTestId("recorder-play-button");
  const position = page.getByTestId("recorder-position");
  await playButton.click();
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => position.textContent(), {
      intervals: [50],
      timeout: 1_500,
    })
    .toMatch(/^01\|0[34] /);
  await expect
    .poll(async () => position.textContent(), {
      intervals: [50],
      timeout: 1_500,
    })
    .toMatch(/^01\|0[12] /);
  await playButton.click();

  // The range can be repositioned directly on the timeline ruler.
  await dragBy(page, range, 80);
  const movedBox = await range.boundingBox();
  assert(movedBox);
  expect(movedBox.x).toBeCloseTo(initialBox.x + 80, -1);

  // Disabling playback keeps the edited range available for later use.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(range).toBeVisible();

  // The disabled range and its timeline placement persist with the project.
  await page.getByRole("button", { name: /Unsaved changes/ }).click();
  await expect(
    page.getByRole("button", { name: "All changes saved" }),
  ).toBeVisible();
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(range).toBeVisible();
  const restoredBox = await range.boundingBox();
  assert(restoredBox);
  expect(restoredBox.x).toBeCloseTo(movedBox.x, -1);

  // Clearing removes the range and returns the loop feature to its empty state.
  await page.getByTestId("recorder-loop-clear").click();
  await expect(range).toHaveCount(0);
});
