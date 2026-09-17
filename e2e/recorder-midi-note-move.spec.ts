import { expect, test } from "@playwright/test";
import { createRecorderProject } from "./recorder-helpers";

test("moves a MIDI note with a cancellable preview and saves on release", async ({
  page,
}) => {
  // Create a C4 note and save it so the dirty indicator distinguishes preview from commit.
  await createRecorderProject(page);
  await page.getByTestId("recorder-add-midi-track").click();
  const row = page.getByTestId("recorder-midi-track-row");
  const grid = row.getByTestId("recorder-midi-grid");
  const note = grid.locator("[data-note-id]");
  const key = row.getByRole("button", { name: "Preview C4", exact: true });
  await expect(key).toBeVisible();
  const gridBox = (await grid.boundingBox())!;
  const keyBox = (await key.boundingBox())!;
  await page.mouse.click(gridBox.x + 5, keyBox.y + keyBox.height / 2);
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1");
  const save = page.getByTestId("recorder-save-button");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  const original = (await note.boundingBox())!;
  const startX = original.x + original.width / 2;
  const startY = original.y + original.height / 2;

  // Move two grid cells and two pitches, then cancel without changing the saved project.
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(
    startX + original.width * 2,
    startY - keyBox.height * 2,
    { steps: 4 },
  );
  await expect(note).toHaveAttribute("aria-label", "D4, beat 1.5");
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1");
  await expect(save).toHaveAttribute("data-status", "saved");

  // Drag beyond the start of the timeline and verify the note stays at beat zero.
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(gridBox.x - 20, startY, { steps: 4 });
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1");
  await page.mouse.up();
  await expect(save).toHaveAttribute("data-status", "saved");

  // Release a new move to commit its snapped start and pitch while preserving duration.
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(
    startX + original.width * 2,
    startY - keyBox.height * 2,
    { steps: 4 },
  );
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.mouse.up();
  await expect(note).toHaveAttribute("aria-label", "D4, beat 1.5");
  await expect(save).toHaveAttribute("data-status", "unsaved");
  expect((await note.boundingBox())!.width).toBe(original.width);

  // Save and reload the moved note to verify its final position persists.
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.reload();
  await expect(note).toHaveAttribute("aria-label", "D4, beat 1.5");
  expect((await note.boundingBox())!.width).toBe(original.width);
});
