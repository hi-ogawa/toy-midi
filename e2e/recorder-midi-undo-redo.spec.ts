import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import {
  addRecorderMidiTrack,
  createRecorderMidiNote,
  createRecorderProject,
  dragBy,
  getRecorderMidiNote,
  saveRecorderProject,
} from "./recorder-helpers";

test("undoes and redoes MIDI groups while cancelling drafts and clearing stale history", async ({
  page,
}) => {
  // Create two notes, save, and select both for a single grouped edit.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  const c4 = await createRecorderMidiNote(page, row, {
    beat: 0.5,
    pitch: "C4",
  });
  const e4 = await createRecorderMidiNote(page, row, { beat: 1, pitch: "E4" });
  const notes = row.getByTestId("recorder-midi-grid").locator("[data-note-id]");
  const save = page.getByTestId("recorder-save-button");
  await saveRecorderProject(page);
  await c4.click();
  await e4.click({ modifiers: ["Control"] });
  await expect(c4).toHaveAttribute("data-selected", "true");
  await expect(e4).toHaveAttribute("data-selected", "true");

  // Move the group, then undo and redo both notes with one shortcut per operation.
  const deltaX = DEFAULT_PIXELS_PER_BEAT / 2;
  await dragBy(page, c4, deltaX);
  const movedC4 = getRecorderMidiNote(row, { beat: 1, pitch: "C4" });
  const movedE4 = getRecorderMidiNote(row, { beat: 1.5, pitch: "E4" });
  await expect(movedC4).toBeVisible();
  await expect(movedE4).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(c4).toBeVisible();
  await expect(e4).toBeVisible();
  await expect(notes).toHaveCount(2);
  await page.keyboard.press("Control+Shift+z");
  await expect(movedC4).toBeVisible();
  await expect(movedE4).toBeVisible();
  await expect(save).toHaveAttribute("data-status", "unsaved");

  // Exercise Ctrl+Y as the alternative redo shortcut.
  await page.keyboard.press("Control+z");
  await expect(c4).toBeVisible();
  await page.keyboard.press("Control+y");
  await expect(movedC4).toBeVisible();
  await expect(movedE4).toBeVisible();

  // Undo during an active drag and keep the restored notes after pointer release.
  const box = (await movedC4.boundingBox())!;
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 4 });
  await expect(
    getRecorderMidiNote(row, { beat: 1.5, pitch: "C4" }),
  ).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(c4).toBeVisible();
  await expect(e4).toBeVisible();
  await page.mouse.up();
  await expect(c4).toBeVisible();
  await expect(e4).toBeVisible();
  await expect(notes).toHaveCount(2);

  // Create a new note after undo and discard the previous group move's redo entry.
  const g4 = await createRecorderMidiNote(page, row, { beat: 2, pitch: "G4" });
  await page.keyboard.press("Control+Shift+z");
  await expect(c4).toBeVisible();
  await expect(e4).toBeVisible();
  await expect(g4).toBeVisible();
  await expect(notes).toHaveCount(3);

  // Save and reload the notes while starting a fresh, empty undo/redo history.
  await saveRecorderProject(page);
  await page.reload();
  await expect(g4).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(g4).toBeVisible();
  await expect(notes).toHaveCount(3);
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.keyboard.press("Control+Shift+z");
  await expect(c4).toBeVisible();
  await expect(e4).toBeVisible();
  await expect(g4).toBeVisible();
  await expect(notes).toHaveCount(3);
  await expect(save).toHaveAttribute("data-status", "saved");
});
