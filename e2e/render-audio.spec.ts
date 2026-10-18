import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import type { SharedProject } from "../src/lib/project-share";
import { execFileAsync } from "../src/utils/exec";
import {
  addAudio,
  addMidiTrack,
  createMidiNote,
  createProject,
} from "./editor-helpers";
import { selectMenuItem } from "./helpers";
import { decodeWav } from "./wav-helpers";

const ONE_NOTE_PROJECT: SharedProject = {
  title: "One note",
  tempo: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  midiTracks: [
    {
      name: "Piano",
      program: 0,
      notes: [{ pitch: 60, start: 0, duration: 1, velocity: 100 }],
    },
  ],
};

test("renders a project archive through the CLI", async ({ page, baseURL }) => {
  // Build a project with backing audio and a MIDI note, and export its archive.
  await createProject(page);
  await addAudio(page, "e2e/fixtures/test-audio.wav");
  const track = await addMidiTrack(page);
  await createMidiNote(page, track, { beat: 0, pitch: "C4" });
  const downloadPromise = page.waitForEvent("download");
  await selectMenuItem(page, { menu: "Editor menu", item: "Export Project" });
  const archivePath = test.info().outputPath("project.toymidi.zip");
  await (await downloadPromise).saveAs(archivePath);

  // Render the archive with the CLI against the test server.
  const outputPath = test.info().outputPath("mix.wav");
  await execFileAsync("node", [
    "packages/cli/bin/cli.js",
    "render-audio",
    archivePath,
    outputPath,
    "--url",
    baseURL!,
  ]);

  // Check the file matches Export Audio's format and holds the 3 s mix.
  const wav = decodeWav(await readFile(outputPath));
  expect(wav).toMatchObject({ channelCount: 2, sampleRate: 48000 });
  expect(wav.duration).toBeCloseTo(3);
  expect(wav.samples.some((sample) => sample !== 0)).toBe(true);
});

test("renders a shared project JSON through the CLI", async ({ baseURL }) => {
  // Write a one-note project in the share link format.
  const projectPath = test.info().outputPath("project.json");
  await writeFile(projectPath, JSON.stringify(ONE_NOTE_PROJECT));

  // Render the JSON with the CLI against the test server.
  const outputPath = test.info().outputPath("mix.wav");
  await execFileAsync("node", [
    "packages/cli/bin/cli.js",
    "render-audio",
    projectPath,
    outputPath,
    "--url",
    baseURL!,
  ]);

  // Check the file holds the note running into its release.
  const wav = decodeWav(await readFile(outputPath));
  expect(wav).toMatchObject({ channelCount: 2, sampleRate: 48000 });
  expect(wav.duration).toBeGreaterThan(2);
  expect(wav.samples.some((sample) => sample !== 0)).toBe(true);
});

test("renders a draft link's src project through the CLI", async ({
  baseURL,
}) => {
  // Serve a one-note project as JSON from another origin.
  await using server = await serveJson(ONE_NOTE_PROJECT);

  // Render a draft link that points at it.
  const draftUrl = new URL("/draft", baseURL);
  draftUrl.searchParams.set("src", server.url);
  const outputPath = test.info().outputPath("mix.wav");
  await execFileAsync("node", [
    "packages/cli/bin/cli.js",
    "render-audio",
    draftUrl.href,
    outputPath,
    "--url",
    baseURL!,
  ]);

  // Check the file holds the note.
  const wav = decodeWav(await readFile(outputPath));
  expect(wav.samples.some((sample) => sample !== 0)).toBe(true);
});

async function serveJson(value: unknown) {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(value));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/project.json`,
    [Symbol.asyncDispose]: () =>
      new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
