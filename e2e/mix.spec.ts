import { readFile } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import type { AmpParameters } from "../src/lib/dsp/amp";
import type { SharedProject } from "../src/lib/project-share";
import {
  addAudio,
  addMidiTrack,
  createMidiNote,
  createProject,
} from "./editor-helpers";
import { selectMenuItem } from "./helpers";
import { decodeWav } from "./wav-helpers";

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

test("exports a track's amp in the WAV", async ({ page }) => {
  // Export a shared project holding one guitar note, with and without the amp.
  const render = async (amp?: AmpParameters) => {
    const project: SharedProject = {
      title: "Amp",
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      midiTracks: [
        {
          name: "Guitar",
          program: 27,
          notes: [{ pitch: 52, start: 0, duration: 2, velocity: 100 }],
          amp,
        },
      ],
    };
    const payload = deflateRawSync(JSON.stringify(project)).toString(
      "base64url",
    );
    await page.goto(`/draft#p=${payload}`);
    await expect(page.getByTestId("draft-badge")).toBeVisible();
    await selectMenuItem(page, { menu: "Editor menu", item: "Export Audio" });
    const modal = page.getByTestId("audio-export");
    const downloadPromise = page.waitForEvent("download");
    await modal.getByRole("button", { name: "Export file" }).click();
    const download = await downloadPromise;
    const downloadPath = test.info().outputPath(`${amp ? "amp" : "dry"}.wav`);
    await download.saveAs(downloadPath);
    return decodeWav(await readFile(downloadPath));
  };
  const dry = await render();
  const amped = await render({ preset: "high-gain", cabinet: true });

  // Check the drive sustains the note: the dry note's tail falls away from its
  // attack, while the amp's tanh stages hold the tail near the attack's level.
  const measureRms = (
    wav: Awaited<ReturnType<typeof render>>,
    start: number,
    end: number,
  ) => {
    const samples = wav.samples.subarray(
      start * wav.sampleRate * wav.channelCount,
      end * wav.sampleRate * wav.channelCount,
    );
    let sum = 0;
    for (const sample of samples) {
      sum += sample * sample;
    }
    return Math.sqrt(sum / samples.length);
  };
  const measureDecayDb = (wav: Awaited<ReturnType<typeof render>>) =>
    20 * Math.log10(measureRms(wav, 0.1, 0.3) / measureRms(wav, 0.8, 1));
  expect(measureDecayDb(dry) - measureDecayDb(amped)).toBeGreaterThan(3);
});
