import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import {
  createRecorderProject,
  addRecorderMidiTrack,
  createRecorderMidiNote,
  saveRecorderProject,
  getRecorderMidiNote,
  seekRecorderByPixels,
} from "./editor-helpers";

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

  // Copy the selected notes and paste them at the moved playhead.
  await page.keyboard.press("Control+c");
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 2);
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

  // Save and reload the project to preserve the pasted notes.
  const save = page.getByTestId("recorder-save-button");
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await saveRecorderProject(page);
  await page.reload();
  await expect(notes).toHaveCount(4);
  await expect(pastedC4).toBeVisible();
  await expect(pastedE4).toBeVisible();
});
