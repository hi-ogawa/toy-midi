import { expect, test } from "@playwright/test";
import {
  createRecorderProject,
  dragBy,
  addRecorderMidiTrack,
  createRecorderMidiNote,
  saveRecorderProject,
} from "./recorder-helpers";

test("resizes both MIDI note edges with a cancellable preview and minimum duration", async ({
  page,
}) => {
  // Create and save a one-cell note, leaving both edges available around its move target.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  const grid = row.getByTestId("recorder-midi-grid");
  const note = grid.locator("[data-note-id]");
  await createRecorderMidiNote(page, row, { beat: 0, pitch: "C4" });
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1");
  const save = page.getByTestId("recorder-save-button");
  await saveRecorderProject(page);
  const cellWidth = (await note.boundingBox())!.width;
  const startEdge = note.locator('[data-note-edge="start"]');
  const endEdge = note.locator('[data-note-edge="end"]');

  // Snap the right edge to the nearest grid point in either direction.
  const halfCellWidth = cellWidth / 2;
  const originalBox = (await note.boundingBox())!;
  const boundaryX = originalBox.x + originalBox.width;
  const endBox = (await endEdge.boundingBox())!;
  const endX = endBox.x + endBox.width / 2;
  const endY = endBox.y + endBox.height / 2;
  await page.mouse.move(endX, endY);
  await page.mouse.down();
  // Cross the gesture threshold vertically so the assertions exercise resize snapping.
  await page.mouse.move(boundaryX + halfCellWidth - 0.5, endY + 6);
  await expect
    .poll(async () => (await note.boundingBox())!.width)
    .toBe(cellWidth);
  await page.mouse.move(boundaryX + halfCellWidth + 0.5, endY + 6);
  await expect
    .poll(async () => (await note.boundingBox())!.width)
    .toBe(cellWidth * 2);
  await page.mouse.move(boundaryX + halfCellWidth - 0.5, endY + 6);
  await expect
    .poll(async () => (await note.boundingBox())!.width)
    .toBe(cellWidth);
  await page.mouse.up();
  await expect(save).toHaveAttribute("data-status", "saved");

  // Extend the right edge in preview, then cancel without making the project dirty.
  await page.mouse.move(endX, endY);
  await page.mouse.down();
  await page.mouse.move(endX + cellWidth * 3, endY, { steps: 4 });
  await expect
    .poll(async () => (await note.boundingBox())!.width)
    .toBe(cellWidth * 4);
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect
    .poll(async () => (await note.boundingBox())!.width)
    .toBe(cellWidth);
  await expect(save).toHaveAttribute("data-status", "saved");

  // Extend the end, then trim the start while keeping the opposite edge and pitch fixed.
  await dragBy(page, endEdge, cellWidth * 3);
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1");
  expect((await note.boundingBox())!.width).toBe(cellWidth * 4);
  await dragBy(page, startEdge, cellWidth * 2);
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1.5");
  expect((await note.boundingBox())!.width).toBe(cellWidth * 2);

  // Undo each edge edit independently, then redo both with the same pitch and durations.
  await page.keyboard.press("Control+z");
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1");
  await expect
    .poll(async () => (await note.boundingBox())!.width)
    .toBe(cellWidth * 4);
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await note.boundingBox())!.width)
    .toBe(cellWidth);
  await page.keyboard.press("Control+Shift+z");
  await expect
    .poll(async () => (await note.boundingBox())!.width)
    .toBe(cellWidth * 4);
  await page.keyboard.press("Control+Shift+z");
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1.5");
  await expect
    .poll(async () => (await note.boundingBox())!.width)
    .toBe(cellWidth * 2);

  // Snap the left edge to the nearest grid point in either direction.
  const trimmedBox = (await note.boundingBox())!;
  const startBox = (await startEdge.boundingBox())!;
  const startY = startBox.y + startBox.height / 2;
  await page.mouse.move(startBox.x + startBox.width / 2, startY);
  await page.mouse.down();
  await page.mouse.move(trimmedBox.x - halfCellWidth + 0.5, startY + 6);
  await expect
    .poll(async () => (await note.boundingBox())!.width)
    .toBe(cellWidth * 2);
  await page.mouse.move(trimmedBox.x - halfCellWidth - 0.5, startY + 6);
  await expect
    .poll(async () => (await note.boundingBox())!.width)
    .toBe(cellWidth * 3);
  await page.mouse.move(trimmedBox.x - halfCellWidth + 0.5, startY + 6);
  await expect
    .poll(async () => (await note.boundingBox())!.width)
    .toBe(cellWidth * 2);
  await page.mouse.up();
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1.5");

  // Clamp the start at beat zero and clamp either edge to a one-cell minimum duration.
  await dragBy(page, startEdge, -cellWidth * 4);
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1");
  expect((await note.boundingBox())!.width).toBe(cellWidth * 4);
  await dragBy(page, startEdge, cellWidth * 6);
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1.75");
  expect((await note.boundingBox())!.width).toBe(cellWidth);
  await dragBy(page, endEdge, -cellWidth * 2);
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1.75");
  expect((await note.boundingBox())!.width).toBe(cellWidth);

  // Save and reload the resized note with its final start and duration.
  await saveRecorderProject(page);
  await page.reload();
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1.75");
  expect((await note.boundingBox())!.width).toBe(cellWidth);
});
