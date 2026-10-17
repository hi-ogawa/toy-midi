import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  addAudio,
  addMidiTrack,
  createMidiNote,
  createProject,
} from "./editor-helpers";
import { selectMenuItem } from "./helpers";

test("exports a stereo WAV from the audio export modal", async ({ page }) => {
  // Try exporting an empty project and verify the render error allows retrying.
  await createProject(page);
  await selectMenuItem(page, { menu: "Editor menu", item: "Export Audio" });
  const modal = page.getByTestId("audio-export");
  const exportButton = modal.getByRole("button", { name: "Export file" });
  await expect(exportButton).toBeEnabled();
  await exportButton.click();
  await expect(
    page.getByText("No audio to export.", { exact: true }),
  ).toBeVisible();
  await expect(exportButton).toBeEnabled();

  // Check the fixed export format before adding audio.
  await expect(
    modal.getByText("WAV, stereo, 48 kHz, 16-bit PCM", { exact: true }),
  ).toBeVisible();
  await modal.getByRole("button", { name: "Close", exact: true }).click();

  // Add backing audio and name the project for the downloaded file.
  await addAudio(page, "e2e/fixtures/test-audio.wav");
  page.once("dialog", (dialog) => dialog.accept("Final mix"));
  await page.getByTestId("project-name").click();

  // Reopen the dialog and export the mix.
  await selectMenuItem(page, { menu: "Editor menu", item: "Export Audio" });
  await expect(exportButton).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Final_mix-.*\.wav$/);
  const downloadPath = test.info().outputPath("mix.wav");
  await download.saveAs(downloadPath);

  // Inspect the downloaded file as stereo 16-bit PCM WAV, not just a named blob.
  const wav = await readFile(downloadPath);
  expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
  expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
  expect(wav.readUInt32LE(24)).toBe(48000);
  await expect(exportButton).toBeEnabled();
});

test("exports MIDI tracks in the WAV", async ({ page }) => {
  // Write a single note in a new MIDI track.
  await createProject(page);
  const track = await addMidiTrack(page);
  await createMidiNote(page, track, { beat: 0, pitch: "C4" });

  // Export the project, which has no audio tracks.
  await selectMenuItem(page, { menu: "Editor menu", item: "Export Audio" });
  const modal = page.getByTestId("audio-export");
  const downloadPromise = page.waitForEvent("download");
  await modal.getByRole("button", { name: "Export file" }).click();
  const download = await downloadPromise;
  const downloadPath = test.info().outputPath("mix.wav");
  await download.saveAs(downloadPath);

  // Check the file runs past the note into its release and is not silent.
  const wav = await readFile(downloadPath);
  const dataOffset = wav.indexOf("data", 12) + 8;
  const samples = new Int16Array(
    wav.buffer.slice(wav.byteOffset + dataOffset, wav.byteOffset + wav.length),
  );
  expect(samples.length / 2 / 48000).toBeGreaterThan(2);
  expect(samples.some((sample) => sample !== 0)).toBe(true);
});
