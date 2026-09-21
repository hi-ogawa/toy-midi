import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import midiPackage from "@tonejs/midi";
import {
  addRecorderMidiTrack,
  createRecorderProject,
  getRecorderMidiNote,
} from "./recorder-helpers";

const { Midi } = midiPackage;

test("imports and exports a MIDI file from track actions", async ({ page }) => {
  // Create an empty MIDI track and a file containing one C4 note.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  const source = new Midi();
  source.addTrack().addNote({
    midi: 60,
    ticks: source.header.ppq,
    durationTicks: source.header.ppq / 2,
    velocity: 0.8,
  });

  // Import the file through the track menu and show its note in the editor.
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("menu", { name: "MIDI 1 actions" })
    .getByRole("menuitem", { name: "Import MIDI…", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await (
    await chooser
  ).setFiles({
    name: "note.mid",
    mimeType: "audio/midi",
    buffer: Buffer.from(source.toArray()),
  });
  await expect(
    getRecorderMidiNote(row, { beat: 1, pitch: "C4" }),
  ).toBeVisible();

  // Export the track and verify the downloaded MIDI contains the imported note.
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("menu", { name: "MIDI 1 actions" })
    .getByRole("menuitem", { name: "Export MIDI", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.mid$/);
  const destination = test.info().outputPath("export.mid");
  await download.saveAs(destination);
  const exported = new Midi(await readFile(destination));
  expect(
    exported.tracks
      .flatMap((track) => track.notes)
      .map((note) => ({
        pitch: note.midi,
        beat: note.ticks / exported.header.ppq,
        duration: note.durationTicks / exported.header.ppq,
      })),
  ).toEqual([{ pitch: 60, beat: 1, duration: 0.5 }]);
});
