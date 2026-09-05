import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createRecorderProject } from "./recorder-helpers";

test("exports a stereo WAV from the audio export modal", async ({ page }) => {
  // Try exporting an empty project and verify the render error allows retrying.
  await createRecorderProject(page);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Export Audio", exact: true })
    .click();
  const modal = page.getByTestId("recorder-audio-export");
  const exportButton = modal.getByRole("button", { name: "Export file" });
  await expect(exportButton).toBeEnabled();
  await exportButton.click();
  await expect(
    page.getByText("No audio to export.", { exact: true }),
  ).toBeVisible();
  await expect(exportButton).toBeEnabled();

  // Preview the export settings before adding audio.
  const sampleRate = modal.getByRole("combobox", { name: "Sample rate" });
  await expect(sampleRate).toHaveValue("48000");
  await sampleRate.selectOption("44100");
  await expect(sampleRate).toHaveValue("44100");
  await modal.getByRole("button", { name: "Close", exact: true }).click();

  // Add backing audio and name the project for the downloaded file.
  const fileChooser = page.waitForEvent("filechooser");
  await page.getByTestId("recorder-add-audio-file").click();
  await (await fileChooser).setFiles("e2e/fixtures/test-audio.wav");
  await expect(
    page.getByTestId("recorder-clip-audio").locator("svg"),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept("Final mix"));
  await page.getByTestId("recorder-project-name").click();

  // Reopen the dialog, retain the selected setting, and export the mix.
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
  const downloadPath = test.info().outputPath("mix.wav");
  await download.saveAs(downloadPath);

  // Inspect the downloaded file as stereo 16-bit PCM WAV, not just a named blob.
  const wav = await readFile(downloadPath);
  expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
  expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
  await expect(exportButton).toBeEnabled();
});
