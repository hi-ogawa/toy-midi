import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import { selectMenuItem } from "./helpers";
import {
  addRecorderMidiTrack,
  createRecorderMidiNote,
  createRecorderProject,
  dragBy,
  getRecorderMidiNote,
  saveRecorderProject,
  openRecorderMidiInstrument,
  selectRecorderMidiInstrument,
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

test("undoes and redoes MIDI track creation, note edits, and deletion in order", async ({
  page,
}) => {
  // Create a note on the first track, then add a second track after it.
  await createRecorderProject(page);
  const rows = page.getByTestId("recorder-midi-track-row");
  const first = await addRecorderMidiTrack(page);
  const note = await createRecorderMidiNote(page, first, {
    beat: 0.5,
    pitch: "C4",
  });
  const noteId = await note.getAttribute("data-note-id");
  await addRecorderMidiTrack(page);

  // Set the first track's instrument and gain so deletion must preserve both settings.
  const instrument = await openRecorderMidiInstrument(page, { name: "MIDI 1" });
  await selectRecorderMidiInstrument(instrument, {
    option: "33: Electric Bass (finger)",
  });
  await instrument.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByTestId("recorder-mixer-button").click();
  const level = page.getByRole("textbox", { name: "MIDI 1 level in dB" });
  await level.fill("-6");
  await level.press("Enter");
  await expect(first).toContainText("-6.0 dB");
  await page.getByTestId("recorder-mixer-button").click();

  // Delete the first track and leave only the second track visible.
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Remove track" });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("MIDI 2");

  // Undo deletion and restore the first track's position, note identity, instrument, and gain.
  await page.keyboard.press("Control+z");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("MIDI 1");
  await expect(rows.nth(1)).toContainText("MIDI 2");
  await expect(note).toHaveAttribute("data-note-id", noteId!);
  await expect(first).toContainText("-6.0 dB");
  await openRecorderMidiInstrument(page, { name: "MIDI 1" });
  await expect(instrument.getByTestId("instrument-select")).toContainText(
    "33: Electric Bass (finger)",
  );
  await instrument.getByRole("button", { name: "Close", exact: true }).click();

  // Undo the second track's creation, the note edit, and the first track's creation.
  await page.keyboard.press("Control+z");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("MIDI 1");
  await expect(note).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(
    first.getByTestId("recorder-midi-grid").locator("[data-note-id]"),
  ).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(rows).toHaveCount(0);

  // Redo creation, the note edit, second-track creation, and deletion in the original order.
  await page.keyboard.press("Control+Shift+z");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("MIDI 1");
  await expect(
    first.getByTestId("recorder-midi-grid").locator("[data-note-id]"),
  ).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z");
  await expect(note).toHaveAttribute("data-note-id", noteId!);
  await page.keyboard.press("Control+Shift+z");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("MIDI 2");
  await page.keyboard.press("Control+Shift+z");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("MIDI 2");
});
