import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import { createRecorderProject, dragBy } from "./recorder-helpers";

test("moves and resizes selected MIDI notes together", async ({ page }) => {
  await createRecorderProject(page);
  await page.getByTestId("recorder-add-midi-track").click();
  const row = page.getByTestId("recorder-midi-track-row");
  const grid = row.getByTestId("recorder-midi-grid");
  const notes = grid.locator("[data-note-id]");
  const gridBox = (await grid.boundingBox())!;
  const c4Key = row.getByRole("button", { name: "Preview C4", exact: true });
  const e4Key = row.getByRole("button", { name: "Preview E4", exact: true });
  const c4KeyBox = (await c4Key.boundingBox())!;
  const e4KeyBox = (await e4Key.boundingBox())!;

  await page.mouse.click(
    gridBox.x + DEFAULT_PIXELS_PER_BEAT * 0.5 + 5,
    c4KeyBox.y + c4KeyBox.height / 2,
  );
  await page.mouse.click(
    gridBox.x + DEFAULT_PIXELS_PER_BEAT + 5,
    e4KeyBox.y + e4KeyBox.height / 2,
  );
  await expect(notes).toHaveCount(2);
  const c4 = grid.locator('[aria-label="C4, beat 1.5"]');
  const e4 = grid.locator('[aria-label="E4, beat 2"]');
  const cellWidth = (await c4.boundingBox())!.width;
  await c4.click({ modifiers: ["Control"] });
  await expect(c4).toHaveAttribute("data-selected", "true");
  await expect(e4).toHaveAttribute("data-selected", "true");

  // Dragging one selected note moves the whole group by a shared time/pitch delta.
  await dragBy(page, c4, cellWidth * 2, { deltaY: -c4KeyBox.height });
  const movedC4 = grid.locator('[aria-label="C#4, beat 2"]');
  const movedE4 = grid.locator('[aria-label="F4, beat 2.5"]');
  await expect(movedC4).toHaveAttribute("data-selected", "true");
  await expect(movedE4).toHaveAttribute("data-selected", "true");

  // Either edge applies the same resize delta to every selected note.
  await dragBy(page, movedC4.locator('[data-note-edge="end"]'), cellWidth);
  expect((await movedC4.boundingBox())!.width).toBeCloseTo(cellWidth * 2, 1);
  expect((await movedE4.boundingBox())!.width).toBeCloseTo(cellWidth * 2, 1);
  await dragBy(page, movedC4.locator('[data-note-edge="start"]'), -cellWidth);
  const resizedC4 = grid.locator('[aria-label="C#4, beat 1.75"]');
  const resizedE4 = grid.locator('[aria-label="F4, beat 2.25"]');
  expect((await resizedC4.boundingBox())!.width).toBeCloseTo(cellWidth * 3, 1);
  expect((await resizedE4.boundingBox())!.width).toBeCloseTo(cellWidth * 3, 1);

  const save = page.getByTestId("recorder-save-button");
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.reload();
  await expect(resizedC4).toBeVisible();
  await expect(resizedE4).toBeVisible();
});
