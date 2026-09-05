import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createRecorderProject } from "./fake-audio/recorder-helpers";

test("exports a stereo WAV from the audio export modal", async ({ page }) => {
  await createRecorderProject(page);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Export Audio", exact: true })
    .click();
  const modal = page.getByTestId("recorder-audio-export");
  const exportButton = modal.getByRole("button", { name: "Export file" });
  await expect(exportButton).toBeDisabled();
  await expect(
    modal.getByText("WAV, stereo, 16-bit PCM", { exact: true }),
  ).toBeVisible();
  const sampleRate = modal.getByRole("combobox", { name: "Sample rate" });
  await expect(sampleRate).toHaveValue("48000");
  await sampleRate.selectOption("44100");
  await expect(sampleRate).toHaveValue("44100");
  await modal.getByRole("button", { name: "Close", exact: true }).click();

  const fileChooser = page.waitForEvent("filechooser");
  await page.getByTestId("recorder-add-audio-file").click();
  await (await fileChooser).setFiles("e2e/fixtures/test-audio.wav");
  await expect(
    page.getByTestId("recorder-clip-audio").locator("svg"),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept("Final mix"));
  await page.getByTestId("recorder-project-name").click();

  await page.getByRole("button", { name: "More", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Export Audio", exact: true })
    .click();
  await expect(exportButton).toBeEnabled();
  await expect(sampleRate).toHaveValue("44100");
  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Final_mix-.*\.wav$/);
  const path = test.info().outputPath("mix.wav");
  await download.saveAs(path);
  const wav = await readFile(path);
  expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
  expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
  expect(wav.readUInt32LE(4)).toBe(wav.length - 8);
  expect(wav.readUInt16LE(20)).toBe(1);
  expect(wav.readUInt16LE(22)).toBe(2);
  expect(wav.readUInt32LE(24)).toBeGreaterThan(0);
  expect(wav.readUInt16LE(34)).toBe(16);
  expect(wav.readUInt32LE(40)).toBe(wav.length - 44);
  expect(wav.length).toBeGreaterThan(44);
  await expect(exportButton).toBeEnabled();
});

test("offline mix preserves stereo, resamples mono regions, and applies track/master gains", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/lib/recorder/mix.ts";
    const { renderRecorderMix } = (await import(
      modulePath
    )) as typeof import("../src/lib/recorder/mix.ts");
    const stereo = new AudioBuffer({
      numberOfChannels: 2,
      length: 48000,
      sampleRate: 48000,
    });
    stereo.getChannelData(0).fill(0.25);
    stereo.getChannelData(1).fill(-0.5);
    const mono = new AudioBuffer({
      numberOfChannels: 1,
      length: 22050,
      sampleRate: 22050,
    });
    mono.getChannelData(0).fill(0.75);
    const buffer = (await renderRecorderMix({
      sampleRate: 48000,
      mix: {
        duration: 1.5,
        masterGain: 0.5,
        tracks: [
          {
            gain: 0.5,
            regions: [
              { buffer: stereo, start: 0.25, offset: 0.25, duration: 0.75 },
            ],
          },
          {
            gain: 4,
            regions: [
              { buffer: mono, start: 0.5, offset: 0.25, duration: 0.25 },
              { buffer: mono, start: 1, offset: 0.5, duration: 0.25 },
            ],
          },
          {
            gain: 0,
            regions: [{ buffer: stereo, start: 0.5, offset: 0, duration: 1 }],
          },
        ],
      },
    }))!;
    return {
      channels: buffer.numberOfChannels,
      sampleRate: buffer.sampleRate,
      length: buffer.length,
      samples: [0.1, 0.3, 0.6, 0.8, 1.1, 1.4].map((time) =>
        [0, 1].map(
          (channel) => buffer.getChannelData(channel)[Math.round(time * 48000)],
        ),
      ),
    };
  });
  expect(result.channels).toBe(2);
  expect(result.sampleRate).toBe(48000);
  expect(result.length).toBe(72000);
  const expected = [
    [0, 0],
    [0.0625, -0.125],
    [1.5625, 1.375],
    [0.0625, -0.125],
    [1.5, 1.5],
    [0, 0],
  ];
  for (const [index, channels] of expected.entries()) {
    for (const [channel, sample] of channels.entries()) {
      expect(result.samples[index]![channel]).toBeCloseTo(sample, 5);
    }
  }
});
