import { readFile } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import type { SharedProject } from "../src/lib/project-share";
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

  // Check the file is stereo 16-bit PCM holding the 3 s backing audio.
  const wav = decodeWav(await readFile(downloadPath));
  expect(wav).toMatchObject({ channelCount: 2, sampleRate: 48000 });
  expect(wav.duration).toBeCloseTo(3);
  expect(wav.samples.some((sample) => sample !== 0)).toBe(true);
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

  // Check the file is stereo 16-bit PCM running past the note into its release.
  const wav = decodeWav(await readFile(downloadPath));
  expect(wav).toMatchObject({ channelCount: 2, sampleRate: 48000 });
  expect(wav.duration).toBeGreaterThan(2);
  expect(wav.samples.some((sample) => sample !== 0)).toBe(true);
});

test("exports per-track stems with the mix", async ({ page }) => {
  // Add backing audio and a MIDI track with one note.
  await createProject(page);
  await addAudio(page, "e2e/fixtures/test-audio.wav");
  const track = await addMidiTrack(page);
  await createMidiNote(page, track, { beat: 0, pitch: "C4" });

  // Export with post-fader stems.
  await selectMenuItem(page, { menu: "Editor menu", item: "Export Audio" });
  const modal = page.getByTestId("audio-export");
  await modal.getByLabel("Stems").selectOption("post-fader");
  const downloadPromise = page.waitForEvent("download");
  await modal.getByRole("button", { name: "Export file" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-stems-.*\.zip$/);
  const downloadPath = test.info().outputPath("stems.zip");
  await download.saveAs(downloadPath);

  // Check the zip holds the mix and one stem per track, all as long as the
  // mix, with the project's empty default track rendered as silence.
  const zip = await JSZip.loadAsync(await readFile(downloadPath));
  expect(Object.keys(zip.files).sort()).toEqual([
    "01-Audio_1.wav",
    "02-Audio_2.wav",
    "03-MIDI_1.wav",
    "mix.wav",
  ]);
  const wavs = new Map(
    await Promise.all(
      Object.values(zip.files).map(
        async (file) =>
          [file.name, decodeWav(await file.async("nodebuffer"))] as const,
      ),
    ),
  );
  for (const [name, wav] of wavs) {
    expect(wav).toMatchObject({
      channelCount: 2,
      sampleRate: 48000,
      duration: wavs.get("mix.wav")!.duration,
    });
    expect(wav.samples.some((sample) => sample !== 0)).toBe(
      name !== "01-Audio_1.wav",
    );
  }
});

test("exports MIDI automation in the WAV", async ({ page }) => {
  // Open a shared project whose held note swells in from silence on
  // expression (CC11), reaching full level at beat 2, one second at 120 BPM.
  const project: SharedProject = {
    title: "Swell",
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    midiTracks: [
      {
        name: "Strings",
        program: 48,
        notes: [{ pitch: 60, start: 0, duration: 4, velocity: 100 }],
        automation: [
          {
            type: "controller",
            controller: 11,
            points: [
              { beat: 0, value: 0 },
              { beat: 2, value: 127 },
            ],
          },
        ],
      },
    ],
  };
  const payload = deflateRawSync(JSON.stringify(project)).toString("base64url");
  await page.goto(`/draft#p=${payload}`);
  await expect(page.getByTestId("draft-badge")).toBeVisible();

  // Export the draft.
  await selectMenuItem(page, { menu: "Editor menu", item: "Export Audio" });
  const modal = page.getByTestId("audio-export");
  const downloadPromise = page.waitForEvent("download");
  await modal.getByRole("button", { name: "Export file" }).click();
  const download = await downloadPromise;
  const downloadPath = test.info().outputPath("mix.wav");
  await download.saveAs(downloadPath);

  // Check the note is silent before the swell and sounds after it.
  const wav = decodeWav(await readFile(downloadPath));
  const isSilent = (start: number, end: number) =>
    wav.samples
      .subarray(
        start * wav.sampleRate * wav.channelCount,
        end * wav.sampleRate * wav.channelCount,
      )
      .every((sample) => sample === 0);
  expect(isSilent(0, 0.9)).toBe(true);
  expect(isSilent(1, 2)).toBe(false);
});

/** Decode a 16-bit PCM WAV into its format, duration in seconds, and interleaved samples. */
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
  const PCM = 1;
  if (format.readUInt16LE(0) !== PCM || format.readUInt16LE(14) !== 16) {
    throw new Error("Only 16-bit PCM WAV is supported.");
  }
  const channelCount = format.readUInt16LE(2);
  const sampleRate = format.readUInt32LE(4);
  const samples = new Int16Array(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.length),
  );
  return {
    channelCount,
    sampleRate,
    duration: samples.length / channelCount / sampleRate,
    samples,
  };
}
