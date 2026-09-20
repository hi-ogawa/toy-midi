import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import midiPackage from "@tonejs/midi";
import {
  addRecorderMidiTrack,
  createRecorderMidiNote,
  createRecorderProject,
  getRecorderMidiNote,
  saveRecorderProject,
} from "./recorder-helpers";

const { Midi } = midiPackage;

test("imports all MIDI tracks as one undoable replacement and exports the chosen track", async ({
  page,
}) => {
  // Create two MIDI tracks so import and export must stay scoped to the chosen track.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  const original = await createRecorderMidiNote(page, row, {
    beat: 0,
    pitch: "G4",
  });
  const otherRow = await addRecorderMidiTrack(page);
  await otherRow.scrollIntoViewIfNeeded();
  const otherNote = await createRecorderMidiNote(page, otherRow, {
    beat: 0,
    pitch: "D4",
  });
  const notes = row.getByTestId("recorder-midi-grid").locator("[data-note-id]");
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  await page
    .getByRole("menuitem", { name: "Instrument…", exact: true })
    .click();
  const instrument = page.getByRole("combobox", { name: "MIDI 1 program" });
  await instrument.click();
  await page.getByPlaceholder("Search instruments...").fill("Finger");
  await page
    .getByRole("option", { name: "33: Electric Bass (finger)", exact: true })
    .click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await saveRecorderProject(page);

  // Cancel the import confirmation and retain the original notes and saved state.
  const file = createMidiFile();
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  const cancelledChooser = page.waitForEvent("filechooser");
  await page
    .getByRole("menuitem", { name: "Import MIDI…", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await (await cancelledChooser).setFiles(file);
  await expect(original).toBeVisible();
  await expect(page.getByTestId("recorder-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );

  // Import both source tracks without adopting their tempo, meter, or instruments.
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("menuitem", { name: "Import MIDI…", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await (await chooser).setFiles(file);
  const c4 = getRecorderMidiNote(row, { beat: 1, pitch: "C4" });
  const e4 = getRecorderMidiNote(row, { beat: 2, pitch: "E4" });
  await expect(c4).toBeVisible();
  await expect(e4).toBeVisible();
  await expect(notes).toHaveCount(2);
  await expect(original).toBeHidden();
  await expect(otherNote).toBeVisible();
  await expect(page.getByTestId("recorder-tempo-input")).toHaveValue("120");
  await expect(
    page.getByRole("button", { name: "4/4", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("recorder-save-button")).toHaveAttribute(
    "data-status",
    "unsaved",
  );

  // Undo and redo the entire replacement with one history operation each.
  await page.keyboard.press("Control+z");
  await expect(original).toBeVisible();
  await expect(notes).toHaveCount(1);
  await page.keyboard.press("Control+Shift+z");
  await expect(c4).toBeVisible();
  await expect(e4).toBeVisible();
  await expect(notes).toHaveCount(2);

  // Save and reload the imported notes while retaining the destination instrument.
  await saveRecorderProject(page);
  await page.reload();
  await expect(c4).toBeVisible();
  await expect(e4).toBeVisible();
  await expect(otherNote).toBeVisible();
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  await page
    .getByRole("menuitem", { name: "Instrument…", exact: true })
    .click();
  await expect(instrument).toContainText("33: Electric Bass (finger)");
  await page.getByRole("button", { name: "Close", exact: true }).click();

  // Export the chosen track and inspect its notes, timing, velocity, and project metadata.
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("menuitem", { name: "Export MIDI", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.mid$/);
  const destination = test.info().outputPath("export.mid");
  await download.saveAs(destination);
  const midi = new Midi(await readFile(destination));
  expect(midi.header.tempos[0].bpm).toBe(120);
  expect(midi.header.timeSignatures[0].timeSignature).toEqual([4, 4]);
  const exportedTracks = midi.tracks.filter((track) => track.notes.length);
  expect(exportedTracks).toHaveLength(1);
  expect(exportedTracks[0].name).toBe("MIDI 1");
  expect(
    exportedTracks[0].notes.map((note) => ({
      pitch: note.midi,
      beat: note.ticks / midi.header.ppq,
      duration: note.durationTicks / midi.header.ppq,
      velocity: Math.round(note.velocity * 127),
    })),
  ).toEqual([
    { pitch: 60, beat: 1, duration: 0.5, velocity: 80 },
    { pitch: 64, beat: 2, duration: 1, velocity: 110 },
  ]);
});

test("keeps existing notes when a MIDI file cannot be parsed", async ({
  page,
}) => {
  // Save an existing note before choosing an invalid file.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  const original = await createRecorderMidiNote(page, row, {
    beat: 0,
    pitch: "C4",
  });
  await saveRecorderProject(page);

  // Confirm the invalid import and retain the saved note after the error is reported.
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("menuitem", { name: "Import MIDI…", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await (
    await chooser
  ).setFiles({
    name: "invalid.mid",
    mimeType: "audio/midi",
    buffer: Buffer.from("not a MIDI file"),
  });
  await expect(
    page.getByText("Failed to import MIDI file", { exact: true }),
  ).toBeVisible();
  await expect(original).toBeVisible();
  await expect(page.getByTestId("recorder-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
});

function createMidiFile() {
  const midi = new Midi();
  midi.header.setTempo(90);
  midi.header.timeSignatures = [
    { ticks: 0, timeSignature: [3, 4], measures: 0 },
  ];
  for (const [index, pitch, beat, duration, velocity] of [
    [0, 60, 1, 0.5, 80],
    [1, 64, 2, 1, 110],
  ]) {
    const track = midi.addTrack();
    track.name = `Source ${index + 1}`;
    track.instrument.number = 24;
    track.addNote({
      midi: pitch,
      ticks: beat * midi.header.ppq,
      durationTicks: duration * midi.header.ppq,
      velocity: velocity / 127,
    });
  }
  return {
    name: "multiple-tracks.mid",
    mimeType: "audio/midi",
    buffer: Buffer.from(midi.toArray()),
  };
}
