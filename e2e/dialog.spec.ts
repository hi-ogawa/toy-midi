import { expect, test } from "@playwright/test";
import {
  createProject,
  getPosition,
  addMidiTrack,
  createMidiNote,
  openMidiInstrument,
} from "./editor-helpers";

test("instrument dialog isolates shortcuts", async ({ page }) => {
  // Open a track's instrument dialog from its menu with a selected unsaved note.
  await createProject(page);
  const row = await addMidiTrack(page);
  const note = await createMidiNote(page, row, {
    beat: 0,
    pitch: "C4",
  });
  const dialog = await openMidiInstrument(page, { name: "MIDI 1" });
  await expect(dialog).toBeVisible();

  // Keep editor shortcuts from changing the project while the dialog is open.
  await page.keyboard.press("Delete");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("m");
  await page.keyboard.press("Control+s");
  await expect(note).toBeVisible();
  expect(await getPosition(page)).toBe(0);
  await expect(page.getByTitle("Toggle metronome (M)")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.getByTestId("save-button")).toHaveAttribute(
    "data-status",
    "unsaved",
  );
});
