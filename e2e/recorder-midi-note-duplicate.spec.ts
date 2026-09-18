import { expect, test } from "@playwright/test";
import { createRecorderProject } from "./recorder-helpers";

test("duplicates selected MIDI notes by modifier-dragging", async ({
  page,
}) => {
  // Create two notes and save the project before duplicating them.
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
  const save = page.getByTestId("recorder-save-button");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");

  async function selectOriginals() {
    await originalC4.click({ modifiers: ["Control"] });
    await originalE4.click({ modifiers: ["Control"] });
    await expect(originalC4).toHaveAttribute("data-selected", "true");
    await expect(originalE4).toHaveAttribute("data-selected", "true");
  }

  async function startDuplicateDrag() {
    const box = (await originalC4.boundingBox())!;
    await page.keyboard.down("Control");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + cellWidth * 2,
      box.y + box.height / 2,
      { steps: 4 },
    );
  }

  // Duplicate previews stay local and can be cancelled.
  await selectOriginals();
  await startDuplicateDrag();
  await expect(notes).toHaveCount(4);
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.keyboard.up("Control");
  await page.keyboard.press("Escape");
  await expect(notes).toHaveCount(2);
  await page.mouse.up();
  await expect(save).toHaveAttribute("data-status", "saved");

  // Releasing commits the copied group and selects only the duplicates.
  await selectOriginals();
  await startDuplicateDrag();
  await page.mouse.up();
  await page.keyboard.up("Control");
  await expect(notes).toHaveCount(4);
  const duplicateC4 = grid.locator('[aria-label="C4, beat 1.5"]');
  const duplicateE4 = grid.locator('[aria-label="E4, beat 2"]');
  await expect(duplicateC4).toHaveAttribute("data-selected", "true");
  await expect(duplicateE4).toHaveAttribute("data-selected", "true");
  await expect(originalC4).toHaveAttribute("data-selected", "false");
  await expect(originalE4).toHaveAttribute("data-selected", "false");
  await expect(save).toHaveAttribute("data-status", "unsaved");

  // Save and reload the project to preserve the duplicated notes.
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.reload();
  await expect(notes).toHaveCount(4);
  await expect(duplicateC4).toBeVisible();
  await expect(duplicateE4).toBeVisible();
});
