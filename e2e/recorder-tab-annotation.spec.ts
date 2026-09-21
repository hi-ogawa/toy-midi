import { expect, test } from "@playwright/test";
import {
  createRecorderProject,
  addRecorderMidiTrack,
  createRecorderMidiNote,
  saveRecorderProject,
  openRecorderMidiInstrument,
} from "./recorder-helpers";

test("assigns MIDI note strings and persists annotation settings", async ({
  page,
}) => {
  // Create a C4 note at the first grid cell with annotations initially hidden.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  const grid = row.getByTestId("recorder-midi-grid");
  const note = grid.locator("[data-note-id]");
  const annotation = note.getByTestId("tab-annotation");
  await createRecorderMidiNote(page, row, { beat: 0, pitch: "C4" });
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1");
  await expect(annotation).toHaveCount(0);
  const originalWidth = (await note.boundingBox())!.width;

  // Enable annotations and choose five-string bass tuning to expose the fifth string.
  const instrument = await openRecorderMidiInstrument(page, { name: "MIDI 1" });
  const enabled = instrument.getByRole("checkbox", {
    name: "Show string annotations",
  });
  const tuning = instrument.getByRole("combobox", {
    name: "Tuning",
    exact: true,
  });
  await enabled.check();
  await tuning.selectOption({ label: "5-string bass (BEADG)" });
  await instrument.getByRole("button", { name: "Close", exact: true }).click();
  await expect(annotation).toHaveText("G17");

  // Assign the fifth string and verify only the string label changes.
  await note.click();
  await page.keyboard.press("5");
  await expect(annotation).toHaveText("B37");
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1");
  expect((await note.boundingBox())!.width).toBe(originalWidth);

  // Return to automatic assignment without changing the note's pitch or timing.
  await page.keyboard.press("0");
  await expect(annotation).toHaveText("G17");
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1");
  expect((await note.boundingBox())!.width).toBe(originalWidth);

  // Save and reload to verify the automatic label, annotation toggle, and tuning persist.
  await saveRecorderProject(page);
  await page.reload();
  await expect(annotation).toHaveText("G17");
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1");
  expect((await note.boundingBox())!.width).toBe(originalWidth);
  await openRecorderMidiInstrument(page, { name: "MIDI 1" });
  await expect(enabled).toBeChecked();
  await expect(tuning).toHaveValue("fiveStringBass");
});
