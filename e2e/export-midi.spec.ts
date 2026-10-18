import { readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import midiPackage from "@tonejs/midi";
import type { SharedProject } from "../src/lib/project-share";
import { execFileAsync } from "../src/utils/exec";

const { Midi } = midiPackage;

const TWO_TRACK_PROJECT: SharedProject = {
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

test("exports a shared project JSON's MIDI tracks through the CLI", async ({
  baseURL,
}) => {
  // Write a two-track project in the share link format.
  const projectPath = test.info().outputPath("project.json");
  await writeFile(projectPath, JSON.stringify(TWO_TRACK_PROJECT));

  // Export it with the CLI against the test server.
  const outputPath = test.info().outputPath("project.mid");
  await execFileAsync("node", [
    "packages/cli/bin/cli.js",
    "export-midi",
    projectPath,
    outputPath,
    "--url",
    baseURL!,
  ]);

  // Find the project's tempo, meter, and both tracks with their notes.
  const midi = new Midi(await readFile(outputPath));
  expect(midi.header.tempos.map((tempo) => Math.round(tempo.bpm))).toEqual([
    100,
  ]);
  expect(midi.header.timeSignatures[0].timeSignature).toEqual([3, 4]);
  expect(
    midi.tracks.map((track) => ({
      name: track.name,
      program: track.instrument.number,
      notes: track.notes.map((note) => ({
        pitch: note.midi,
        beat: note.ticks / midi.header.ppq,
      })),
    })),
  ).toEqual([
    { name: "Bass", program: 33, notes: [{ pitch: 40, beat: 0 }] },
    { name: "Piano", program: 0, notes: [{ pitch: 64, beat: 1 }] },
  ]);
});
