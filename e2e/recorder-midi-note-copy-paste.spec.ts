import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import {
  createRecorderProject,
  addRecorderMidiTrack,
  createRecorderMidiNote,
  saveRecorderProject,
  getRecorderMidiNote,
  getRecorderBeat,
  seekRecorderByPixels,
} from "./recorder-helpers";

test("copies selected MIDI notes and pastes them at the playhead", async ({
  page,
}) => {
  // Create two notes and select them as one clipboard group.
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
  await originalC4.click({ modifiers: ["Control"] });
  await expect(originalC4).toHaveAttribute("data-selected", "true");
  await expect(originalE4).toHaveAttribute("data-selected", "true");

  // Copy the notes, then coarsen the grid so pasting must snap an off-grid playhead.
  await page.keyboard.press("Control+c");
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 2.25);
  await page.getByTestId("recorder-grid-snap-select").click();
  await page.getByRole("menuitemradio", { name: "1/4", exact: true }).click();
  await expect.poll(() => getRecorderBeat(page)).toBe(2.25);
  await page.keyboard.press("Control+v");

  // Keep the copied timing and select only the newly pasted notes.
  await expect(notes).toHaveCount(4);
  const pastedC4 = getRecorderMidiNote(row, { pitch: "C4", beat: 2 });
  const pastedE4 = getRecorderMidiNote(row, { pitch: "E4", beat: 2.5 });
  await expect(pastedC4).toHaveAttribute("data-selected", "true");
  await expect(pastedE4).toHaveAttribute("data-selected", "true");
  await expect(originalC4).toHaveAttribute("data-selected", "false");
  await expect(originalE4).toHaveAttribute("data-selected", "false");
  expect((await pastedC4.boundingBox())!.width).toBe(cellWidth);
  expect((await pastedE4.boundingBox())!.width).toBe(cellWidth);

  // Undo and redo the paste as one edit while retaining both original notes.
  await page.keyboard.press("Control+z");
  await expect(notes).toHaveCount(2);
  await expect(originalC4).toBeVisible();
  await expect(originalE4).toBeVisible();
  await page.keyboard.press("Control+Shift+z");
  await expect(notes).toHaveCount(4);
  await expect(pastedC4).toBeVisible();
  await expect(pastedE4).toBeVisible();

  // Save and reload the project to preserve the pasted notes.
  const save = page.getByTestId("recorder-save-button");
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await saveRecorderProject(page);
  await page.reload();
  await expect(notes).toHaveCount(4);
  await expect(pastedC4).toBeVisible();
  await expect(pastedE4).toBeVisible();
});

test("keeps note clipboard separate from selected text and focused inputs", async ({
  page,
}) => {
  // Copy C4, then create E4 to distinguish the note clipboard from the current selection.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  const c4 = await createRecorderMidiNote(page, row, { beat: 0, pitch: "C4" });
  await page.keyboard.press("Control+c");
  const e4 = await createRecorderMidiNote(page, row, { beat: 1, pitch: "E4" });
  await expect(e4).toHaveAttribute("data-selected", "true");
  const notes = row.locator("[data-note-id]");

  // Select the Tracks label with the mouse, clearing note selection while retaining the clipboard.
  await page.getByText("Tracks", { exact: true }).dblclick();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("Tracks");
  await expect(e4).toHaveAttribute("data-selected", "false");
  await page.keyboard.press("Control+c");
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 2);
  await page.keyboard.press("Control+v");
  await expect(notes).toHaveCount(3);
  await expect(
    getRecorderMidiNote(row, { beat: 2, pitch: "C4" }),
  ).toBeVisible();

  // Copy and paste inside the tempo input without editing notes or replacing their clipboard.
  await e4.click();
  const tempo = page.getByTestId("recorder-tempo-input");
  await tempo.focus();
  await tempo.selectText();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(tempo).toHaveValue("120");
  await expect(notes).toHaveCount(3);
  await tempo.blur();
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 3);
  await page.keyboard.press("Control+v");
  await expect(notes).toHaveCount(4);
  await expect(
    getRecorderMidiNote(row, { beat: 3, pitch: "C4" }),
  ).toBeVisible();
  await expect(c4).toBeVisible();
});
