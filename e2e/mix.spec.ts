import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { addAudio, createProject } from "./editor-helpers";
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
