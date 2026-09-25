import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import midiPackage from "@tonejs/midi";
import { selectMenuItem } from "./helpers";
import {
  addRecorderMidiTrack,
  createRecorderMidiNote,
  createRecorderProject,
  getRecorderMidiNote,
  openRecorderMidiInstrument,
  selectRecorderMidiInstrument,
} from "./recorder-helpers";

const { Midi } = midiPackage;

test("imports and exports a MIDI file from track actions", async ({ page }) => {
  // Create a bass track and a violin MIDI file containing one C4 note.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  const instrument = await openRecorderMidiInstrument(page, { name: "MIDI 1" });
  await selectRecorderMidiInstrument(instrument, {
    option: "33: Electric Bass (finger)",
  });
  await instrument.getByRole("button", { name: "Close", exact: true }).click();
  const source = new Midi();
  const sourceTrack = source.addTrack();
  sourceTrack.instrument.number = 40;
  sourceTrack.addNote({
    midi: 60,
    ticks: source.header.ppq,
    durationTicks: source.header.ppq / 2,
    velocity: 0.8,
  });

  // Import the file through the track menu and show its note in the editor.
  const chooser = page.waitForEvent("filechooser");
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Import MIDI…" });
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

  // Keep the destination's bass instrument despite the imported violin program.
  await openRecorderMidiInstrument(page, { name: "MIDI 1" });
  await expect(instrument.getByTestId("instrument-select")).toContainText(
    "33: Electric Bass (finger)",
  );
  await instrument.getByRole("button", { name: "Close", exact: true }).click();

  // Export the track and verify the downloaded MIDI contains the imported note.
  const downloadPromise = page.waitForEvent("download");
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Export MIDI" });
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

test("exports MusicXML from track actions", async ({ page }) => {
  // Create an empty MIDI track.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);

  // Export the empty track and show why MusicXML cannot be exported.
  await selectMenuItem(page, {
    menu: "MIDI 1 actions",
    item: "Export MusicXML",
  });
  await expect(
    page.locator('[data-sonner-toast][data-type="error"]'),
  ).toHaveText("Add at least one note before exporting MusicXML");

  // Add a D4 note and download MusicXML containing it.
  await createRecorderMidiNote(page, row, { beat: 1, pitch: "D4" });
  const downloadPromise = page.waitForEvent("download");
  await selectMenuItem(page, {
    menu: "MIDI 1 actions",
    item: "Export MusicXML",
  });
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^Untitled-MIDI_1-.*\.musicxml$/,
  );
  const destination = test.info().outputPath("export.musicxml");
  await download.saveAs(destination);
  const xml = await readFile(destination, "utf8");
  expect(xml).toContain("<score-partwise");
  // Bass notation is written an octave above the sounding D4.
  expect(xml).toMatch(/<step>D<\/step>\s*<octave>5<\/octave>/);
});
