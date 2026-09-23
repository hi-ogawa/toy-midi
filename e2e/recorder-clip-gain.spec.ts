import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { selectMenuItem, setSliderValue, useFakeAudioInput } from "./helpers";
import {
  createRecorderProject,
  enableInput,
  saveRecorderProject,
  waitForRecordingSamples,
} from "./recorder-helpers";

useFakeAudioInput({ audioFilePath: "e2e/fixtures/test-audio.wav" });

test("adjusts take gain and preserves it in saved audio", async ({ page }) => {
  // Record a take and expand its controls at unity gain.
  await createRecorderProject(page);
  await enableInput(page);
  const record = page.getByTestId("recorder-record-button");
  await record.click();
  await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));
  await record.click();
  await page.getByTestId("recorder-takes-toggle").click();
  const gain = page.getByRole("slider", { name: "Take 1 gain", exact: true });
  await expect(gain).toHaveAttribute("aria-valuenow", "0");
  const original = await exportSamples(page, "original.wav");
  const waveform = page.getByTestId("recorder-clip-comp").locator("svg path");
  const originalPath = await waveform.getAttribute("d");

  // Lower the take by 6 dB and verify its waveform updates while stopped.
  await setSliderValue(gain, [-6]);
  await expect
    .poll(async () => Number(await gain.getAttribute("aria-valuenow")))
    .toBeCloseTo(-6);
  await expect(waveform).not.toHaveAttribute("d", originalPath!);

  // Save and reload the project, then verify exported samples have the same attenuation.
  await saveRecorderProject(page);
  await page.reload();
  await page.getByTestId("recorder-takes-toggle").click();
  await expect
    .poll(async () => Number(await gain.getAttribute("aria-valuenow")))
    .toBeCloseTo(-6);
  const attenuated = await exportSamples(page, "attenuated.wav");
  expect(attenuated.length).toBe(original.length);
  const ratio = 10 ** (-6 / 20);
  expect(
    original.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0),
  ).toBeGreaterThan(100);
  const maxError = original.reduce(
    (error, sample, i) =>
      Math.max(error, Math.abs(attenuated[i] - sample * ratio)),
    0,
  );
  expect(maxError).toBeLessThanOrEqual(2);
});

async function exportSamples(page: Page, name: string): Promise<number[]> {
  return await test.step(
    `Export audio samples to ${name}`,
    async () => {
      await selectMenuItem(page, { menu: "Editor menu", item: "Export Audio" });
      const modal = page.getByTestId("recorder-audio-export");
      const pending = page.waitForEvent("download");
      await modal.getByRole("button", { name: "Export file" }).click();
      const download = await pending;
      const path = test.info().outputPath(name);
      await download.saveAs(path);
      await modal.getByRole("button", { name: "Close", exact: true }).click();
      const wav = await readFile(path);
      let offset = 12;
      while (wav.toString("ascii", offset, offset + 4) !== "data") {
        offset += 8 + wav.readUInt32LE(offset + 4);
      }
      const length = wav.readUInt32LE(offset + 4);
      return Array.from({ length: length / 2 }, (_, i) =>
        wav.readInt16LE(offset + 8 + i * 2),
      );
    },
    { box: true },
  );
}
