import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import {
  addAudio,
  addMidiTrack,
  createMidiNote,
  createProject,
} from "./editor-helpers";
import { selectMenuItem } from "./helpers";

const execFileAsync = promisify(execFile);

test("render a project archive through the CLI", async ({ page, baseURL }) => {
  // Create a project with backing audio and a note in a MIDI track.
  await createProject(page);
  await addAudio(page, "e2e/fixtures/test-audio.wav");
  const track = await addMidiTrack(page);
  await createMidiNote(page, track, { beat: 0, pitch: "C4" });

  // Export the mix from the app.
  await selectMenuItem(page, { menu: "Editor menu", item: "Export Audio" });
  const modal = page.getByTestId("audio-export");
  const audioDownload = page.waitForEvent("download");
  await modal.getByRole("button", { name: "Export file" }).click();
  const appWavPath = test.info().outputPath("app.wav");
  await (await audioDownload).saveAs(appWavPath);
  await modal.getByRole("button", { name: "Close", exact: true }).click();

  // Export the project archive.
  const projectDownload = page.waitForEvent("download");
  await selectMenuItem(page, { menu: "Editor menu", item: "Export Project" });
  const archivePath = test.info().outputPath("project.toymidi.zip");
  await (await projectDownload).saveAs(archivePath);

  // Render the archive with the CLI.
  const cliWavPath = test.info().outputPath("cli.wav");
  await execFileAsync("node", [
    "packages/render-audio/bin/cli.js",
    archivePath,
    cliWavPath,
    "--url",
    baseURL!,
  ]);

  // Expect the same file as Export Audio.
  expect(await readFile(cliWavPath)).toEqual(await readFile(appWavPath));
});
