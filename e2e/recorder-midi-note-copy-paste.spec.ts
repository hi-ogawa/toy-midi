import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import {
  createRecorderProject,
  seekRecorderByPixels,
} from "./recorder-helpers";

test("copies selected MIDI notes and pastes them at the playhead", async ({
  page,
}) => {
  // Create two notes and select them as one clipboard group.
  await createRecorderProject(page);
  await page.getByTestId("recorder-add-midi-track").click();
  const row = page.getByTestId("recorder-midi-track-row");
  const grid = row.getByTestId("recorder-midi-grid");
  const notes = grid.locator("[data-note-id]");
  const gridBox = (await grid.boundingBox())!;
  const c4Key = row.getByRole("button", { name: "Preview C4", exact: true });
  const e4Key = row.getByRole("button", { name: "Preview E4", exact: true });
  const c4KeyBox = (await c4Key.boundingBox())!;

  await page.mouse.click(gridBox.x + 5, c4KeyBox.y + c4KeyBox.height / 2);
  const cellWidth = (await notes.first().boundingBox())!.width;
  const e4KeyBox = (await e4Key.boundingBox())!;
  await page.mouse.click(
    gridBox.x + cellWidth * 2 + 5,
    e4KeyBox.y + e4KeyBox.height / 2,
  );
  const originalC4 = grid.locator('[aria-label="C4, beat 1"]');
  const originalE4 = grid.locator('[aria-label="E4, beat 1.5"]');
  await originalC4.click({ modifiers: ["Control"] });
  await expect(originalC4).toHaveAttribute("data-selected", "true");
  await expect(originalE4).toHaveAttribute("data-selected", "true");

  // Copy the selected notes and paste them at the moved playhead.
  await page.keyboard.press("Control+c");
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 2);
  await page.keyboard.press("Control+v");

  // Keep the copied timing and select only the newly pasted notes.
  await expect(notes).toHaveCount(4);
  const pastedC4 = grid.locator('[aria-label="C4, beat 3"]');
  const pastedE4 = grid.locator('[aria-label="E4, beat 3.5"]');
  await expect(pastedC4).toHaveAttribute("data-selected", "true");
  await expect(pastedE4).toHaveAttribute("data-selected", "true");
  await expect(originalC4).toHaveAttribute("data-selected", "false");
  await expect(originalE4).toHaveAttribute("data-selected", "false");
  expect((await pastedC4.boundingBox())!.width).toBe(cellWidth);
  expect((await pastedE4.boundingBox())!.width).toBe(cellWidth);

  // Save and reload the project to preserve the pasted notes.
  const save = page.getByTestId("recorder-save-button");
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.reload();
  await expect(notes).toHaveCount(4);
  await expect(pastedC4).toBeVisible();
  await expect(pastedE4).toBeVisible();
});
