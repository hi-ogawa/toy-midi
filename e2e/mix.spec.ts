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
  const wav = decodeWav(await readFile(downloadPath));
  expect(wav).toMatchObject({
    channelCount: 2,
    sampleRate: 48000,
    bitsPerSample: 16,
  });
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
  const wav = decodeWav(await readFile(downloadPath));
  const duration = wav.samples.length / wav.channelCount / wav.sampleRate;
  expect(duration).toBeGreaterThan(2);
  expect(wav.samples.some((sample) => sample !== 0)).toBe(true);
});

/** Decode a 16-bit PCM WAV into its format and interleaved samples. */
function decodeWav(bytes: Buffer) {
  if (
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Not a WAV file.");
  }
  let format: Buffer | undefined;
  let data: Buffer | undefined;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const body = bytes.subarray(offset + 8, offset + 8 + size);
    if (id === "fmt ") {
      format = body;
    } else if (id === "data") {
      data = body;
    }
    // Chunks are padded to an even size.
    offset += 8 + size + (size % 2);
  }
  if (!format || !data) {
    throw new Error("WAV is missing its format or data chunk.");
  }
  return {
    channelCount: format.readUInt16LE(2),
    sampleRate: format.readUInt32LE(4),
    bitsPerSample: format.readUInt16LE(14),
    samples: new Int16Array(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.length),
    ),
  };
}
