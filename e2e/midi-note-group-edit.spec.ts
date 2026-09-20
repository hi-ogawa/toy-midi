import { expect, test } from "@playwright/test";
import {
  createProject,
  dragBy,
  addMidiTrack,
  createMidiNote,
  saveProject,
  getMidiNote,
  getMidiGridPoint,
} from "./editor-helpers";

test("moves and resizes selected MIDI notes together", async ({ page }) => {
  // Create two notes and select them as one editing group.
  await createProject(page);
  const row = await addMidiTrack(page);
  const c4 = await createMidiNote(page, row, {
    beat: 0.5,
    pitch: "C4",
  });
  const e4 = await createMidiNote(page, row, { beat: 1, pitch: "E4" });
  await expect(
    row.getByTestId("recorder-midi-grid").locator("[data-note-id]"),
  ).toHaveCount(2);
  const cellWidth = (await c4.boundingBox())!.width;
  await c4.click({ modifiers: ["Control"] });
  await expect(c4).toHaveAttribute("data-selected", "true");
  await expect(e4).toHaveAttribute("data-selected", "true");

  // Dragging one selected note moves the whole group by a shared time/pitch delta.
  const from = await getMidiGridPoint(row, { beat: 0.5, pitch: "C4" });
  const to = await getMidiGridPoint(row, { beat: 1, pitch: "C#4" });
  await dragBy(page, c4, to.x - from.x, { deltaY: to.y - from.y });
  const movedC4 = getMidiNote(row, { pitch: "C#4", beat: 1 });
  const movedE4 = getMidiNote(row, { pitch: "F4", beat: 1.5 });
  await expect(movedC4).toHaveAttribute("data-selected", "true");
  await expect(movedE4).toHaveAttribute("data-selected", "true");

  // Either edge applies the same resize delta to every selected note.
  await dragBy(page, movedC4.locator('[data-note-edge="end"]'), cellWidth);
  expect((await movedC4.boundingBox())!.width).toBeCloseTo(cellWidth * 2, 1);
  expect((await movedE4.boundingBox())!.width).toBeCloseTo(cellWidth * 2, 1);
  await dragBy(page, movedC4.locator('[data-note-edge="start"]'), -cellWidth);
  const resizedC4 = getMidiNote(row, { pitch: "C#4", beat: 0.75 });
  const resizedE4 = getMidiNote(row, { pitch: "F4", beat: 1.25 });
  expect((await resizedC4.boundingBox())!.width).toBeCloseTo(cellWidth * 3, 1);
  expect((await resizedE4.boundingBox())!.width).toBeCloseTo(cellWidth * 3, 1);

  // Save and reload the project to preserve the grouped edits.
  const save = page.getByTestId("recorder-save-button");
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await saveProject(page);
  await page.reload();
  await expect(resizedC4).toBeVisible();
  await expect(resizedE4).toBeVisible();
});
