import { expect, test } from "@playwright/test";
import {
  createRecorderProject,
  addRecorderMidiTrack,
  createRecorderMidiNote,
  saveRecorderProject,
  getRecorderMidiNote,
} from "./recorder-helpers";

test("duplicates selected MIDI notes by modifier-dragging", async ({
  page,
}) => {
  // Create two notes and save the project before duplicating them.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  const grid = row.getByTestId("recorder-midi-grid");
  const notes = grid.locator("[data-note-id]");
  const originalC4 = await createRecorderMidiNote(page, row, {
    beat: 0,
    pitch: "C4",
  });
  const originalE4 = await createRecorderMidiNote(page, row, {
    beat: 0.5,
    pitch: "E4",
  });
  const cellWidth = (await originalC4.boundingBox())!.width;
  const save = page.getByTestId("recorder-save-button");
  await saveRecorderProject(page);

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
  const duplicateC4 = getRecorderMidiNote(row, { pitch: "C4", beat: 0.5 });
  const duplicateE4 = getRecorderMidiNote(row, { pitch: "E4", beat: 1 });
  await expect(duplicateC4).toHaveAttribute("data-selected", "true");
  await expect(duplicateE4).toHaveAttribute("data-selected", "true");
  await expect(originalC4).toHaveAttribute("data-selected", "false");
  await expect(originalE4).toHaveAttribute("data-selected", "false");
  await expect(save).toHaveAttribute("data-status", "unsaved");

  // Save and reload the project to preserve the duplicated notes.
  await saveRecorderProject(page);
  await page.reload();
  await expect(notes).toHaveCount(4);
  await expect(duplicateC4).toBeVisible();
  await expect(duplicateE4).toBeVisible();
});
