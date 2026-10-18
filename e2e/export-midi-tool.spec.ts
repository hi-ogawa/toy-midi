import { readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import midiPackage from "@tonejs/midi";
import type { SharedProject } from "../src/lib/project-share";
import { execFileAsync } from "../src/utils/exec";
import { addMidiTrack, createMidiNote, createProject } from "./editor-helpers";
import { selectMenuItem } from "./helpers";

const { Midi } = midiPackage;

test("exports a project archive's MIDI tracks with the tool", async ({
  page,
}) => {
  // Build a project with two MIDI tracks and export its archive.
  await createProject(page);
  const first = await addMidiTrack(page);
  await createMidiNote(page, first, { beat: 0, pitch: "C4" });
  const second = await addMidiTrack(page);
  await createMidiNote(page, second, { beat: 1, pitch: "E4" });
  const downloadPromise = page.waitForEvent("download");
  await selectMenuItem(page, { menu: "Editor menu", item: "Export Project" });
  const archivePath = test.info().outputPath("project.toymidi.zip");
  await (await downloadPromise).saveAs(archivePath);

  // Export the archive's MIDI with the tool and find both tracks in order.
  const outputPath = test.info().outputPath("project.mid");
  await execFileAsync("pnpm", ["-s", "export-midi", archivePath, outputPath]);
  const midi = new Midi(await readFile(outputPath));
  expect(midi.tracks.map((track) => readTrack(midi, track))).toEqual([
    { name: "MIDI 1", program: 0, notes: [{ pitch: 60, beat: 0 }] },
    { name: "MIDI 2", program: 0, notes: [{ pitch: 64, beat: 1 }] },
  ]);
});

test("exports a shared project JSON's MIDI tracks with the tool", async () => {
  // Write a two-track project in the share link format.
  const project: SharedProject = {
    title: "Two tracks",
    tempo: 100,
    timeSignature: { numerator: 3, denominator: 4 },
    midiTracks: [
      {
        name: "Bass",
        program: 33,
        notes: [{ pitch: 40, start: 0, duration: 1, velocity: 100 }],
      },
      {
        name: "Piano",
        program: 0,
        notes: [{ pitch: 64, start: 1, duration: 1, velocity: 80 }],
      },
    ],
  };
  const projectPath = test.info().outputPath("project.json");
  await writeFile(projectPath, JSON.stringify(project));

  // Export it with the tool and find the tempo, meter, and both tracks.
  const outputPath = test.info().outputPath("project.mid");
  await execFileAsync("pnpm", ["-s", "export-midi", projectPath, outputPath]);
  const midi = new Midi(await readFile(outputPath));
  expect(midi.header.tempos.map((tempo) => Math.round(tempo.bpm))).toEqual([
    100,
  ]);
  expect(midi.header.timeSignatures[0].timeSignature).toEqual([3, 4]);
  expect(midi.tracks.map((track) => readTrack(midi, track))).toEqual([
    { name: "Bass", program: 33, notes: [{ pitch: 40, beat: 0 }] },
    { name: "Piano", program: 0, notes: [{ pitch: 64, beat: 1 }] },
  ]);
});

function readTrack(
  midi: InstanceType<typeof Midi>,
  track: (typeof midi.tracks)[number],
) {
  return {
    name: track.name,
    program: track.instrument.number,
    notes: track.notes.map((note) => ({
      pitch: note.midi,
      beat: note.ticks / midi.header.ppq,
    })),
  };
}
