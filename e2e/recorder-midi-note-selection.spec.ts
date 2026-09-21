import { expect, test } from "@playwright/test";
import {
  createRecorderProject,
  addRecorderMidiTrack,
  createRecorderMidiNote,
  saveRecorderProject,
} from "./recorder-helpers";

test("selects and deletes multiple MIDI notes", async ({ page }) => {
  // Create three notes and save the project before changing selection.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  const grid = row.getByTestId("recorder-midi-grid");
  const notes = grid.locator("[data-note-id]");
  const c4 = await createRecorderMidiNote(page, row, { beat: 0, pitch: "C4" });
  const d4 = await createRecorderMidiNote(page, row, {
    beat: 0.5,
    pitch: "D4",
  });
  const e4 = await createRecorderMidiNote(page, row, { beat: 1, pitch: "E4" });
  await expect(notes).toHaveCount(3);
  const save = page.getByTestId("recorder-save-button");
  await saveRecorderProject(page);

  // Ctrl/Cmd-click toggles notes without changing the project.
  await c4.click({ modifiers: ["Control"] });
  await expect(c4).toHaveAttribute("data-selected", "true");
  await expect(e4).toHaveAttribute("data-selected", "false");
  await e4.click({ modifiers: ["Control"] });
  await expect(e4).toHaveAttribute("data-selected", "true");
  await e4.click({ modifiers: ["Control"] });
  await expect(e4).toHaveAttribute("data-selected", "false");
  await expect(save).toHaveAttribute("data-status", "saved");

  // An ordinary click replaces the current selection.
  await d4.click();
  await expect(c4).toHaveAttribute("data-selected", "false");
  await expect(d4).toHaveAttribute("data-selected", "true");

  // Cancel a box selection with Escape and keep it cancelled through release.
  const cancelC4Box = (await c4.boundingBox())!;
  const cancelD4Box = (await d4.boundingBox())!;
  await page.keyboard.down("Shift");
  await page.mouse.move(
    cancelD4Box.x + cancelD4Box.width * 1.5,
    cancelD4Box.y + cancelD4Box.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    cancelC4Box.x + 1,
    cancelC4Box.y + cancelC4Box.height / 2,
    {
      steps: 4,
    },
  );
  await expect(grid.getByTestId("recorder-midi-box-selection")).toBeVisible();
  await page.keyboard.up("Shift");
  await page.keyboard.press("Escape");
  await expect(grid.getByTestId("recorder-midi-box-selection")).toHaveCount(0);
  await page.mouse.move(
    cancelC4Box.x + 2,
    cancelC4Box.y + cancelC4Box.height / 2,
  );
  await page.mouse.up();
  await expect(grid.getByTestId("recorder-midi-box-selection")).toHaveCount(0);
  await expect(grid.locator("[data-note-id][data-selected=true]")).toHaveCount(
    0,
  );
  await expect(notes).toHaveCount(3);
  await expect(save).toHaveAttribute("data-status", "saved");

  // Shift-drag from empty space selects overlapping notes without creating one.
  const c4Box = (await c4.boundingBox())!;
  const d4Box = (await d4.boundingBox())!;
  await page.keyboard.down("Shift");
  await page.mouse.move(
    d4Box.x + d4Box.width * 1.5,
    d4Box.y + d4Box.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(c4Box.x + 1, c4Box.y + c4Box.height / 2, {
    steps: 4,
  });
  const boxPreview = grid.getByTestId("recorder-midi-box-selection");
  const startY = d4Box.y + d4Box.height / 2;
  const endY = c4Box.y + c4Box.height / 2;
  await expect(boxPreview).toBeVisible();
  await expect
    .poll(async () => (await boxPreview.boundingBox())?.y)
    .toBeCloseTo(startY, 0);
  await expect
    .poll(async () => (await boxPreview.boundingBox())?.height)
    .toBeCloseTo(endY - startY, 0);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(notes).toHaveCount(3);
  await expect(c4).toHaveAttribute("data-selected", "true");
  await expect(d4).toHaveAttribute("data-selected", "true");
  await expect(e4).toHaveAttribute("data-selected", "false");
  await expect(save).toHaveAttribute("data-status", "saved");

  // Delete the selected set together.
  await page.keyboard.press("Delete");
  await expect(notes).toHaveCount(1);
  await expect(e4).toBeVisible();
  await expect(save).toHaveAttribute("data-status", "unsaved");

  // Undo and redo the grouped deletion without changing the surviving note.
  await page.keyboard.press("Control+z");
  await expect(notes).toHaveCount(3);
  await expect(c4).toBeVisible();
  await expect(d4).toBeVisible();
  expect((await c4.boundingBox())!.width).toBe(c4Box.width);
  expect((await d4.boundingBox())!.width).toBe(d4Box.width);
  await expect(e4).toBeVisible();
  await page.keyboard.press("Control+Shift+z");
  await expect(notes).toHaveCount(1);
  await expect(e4).toBeVisible();

  // Save and reload with only the unselected note retained.
  await saveRecorderProject(page);
  await page.reload();
  await expect(notes).toHaveCount(1);
  await expect(e4).toBeVisible();
});
