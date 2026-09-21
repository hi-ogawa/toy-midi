import { expect, test } from "@playwright/test";
import {
  createRecorderProject,
  getRecorderPosition,
  addRecorderMidiTrack,
  createRecorderMidiNote,
  openRecorderMidiInstrument,
} from "./recorder-helpers";

test("instrument dialog isolates shortcuts", async ({ page }) => {
  // Open a track's instrument dialog from its menu with a selected unsaved note.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  const note = await createRecorderMidiNote(page, row, {
    beat: 0,
    pitch: "C4",
  });
  const dialog = await openRecorderMidiInstrument(page, { name: "MIDI 1" });
  await expect(dialog).toBeVisible();

  // Keep editor shortcuts from changing the project while the dialog is open.
  await page.keyboard.press("Delete");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("m");
  await page.keyboard.press("Control+s");
  await expect(note).toBeVisible();
  expect(await getRecorderPosition(page)).toBe(0);
  await expect(page.getByTitle("Toggle metronome (M)")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.getByTestId("recorder-save-button")).toHaveAttribute(
    "data-status",
    "unsaved",
  );
});
