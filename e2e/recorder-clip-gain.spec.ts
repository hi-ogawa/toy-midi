import { expect, test } from "@playwright/test";
import { setSliderValue, useFakeAudioInput } from "./helpers";
import {
  createRecorderProject,
  armTrack,
  enableInput,
  waitForRecordingSamples,
} from "./recorder-helpers";

useFakeAudioInput({ audioFilePath: "e2e/fixtures/test-audio.wav" });

test("adjusts take gain and updates its waveform", async ({ page }) => {
  // Record two consecutive takes and expand their controls at unity gain.
  await createRecorderProject(page);
  await enableInput(page);
  await armTrack(page, { track: "Audio 1" });
  const record = page.getByTestId("recorder-record-button");
  for (let index = 0; index < 2; index++) {
    await record.click();
    await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));
    await record.click();
  }
  await page.getByTestId("recorder-takes-toggle").click();
  const gain = page.getByRole("slider", { name: "Take 1 gain", exact: true });
  await expect(gain).toHaveAttribute("aria-valuenow", "0");
  const waveform = page
    .getByTestId("recorder-clip-audio")
    .filter({ hasText: "Take 1" })
    .locator("svg path");
  const originalPath = await waveform.getAttribute("d");

  // Lower the take by 6 dB and verify its waveform updates.
  await setSliderValue(gain, [-6]);
  await expect
    .poll(async () => Number(await gain.getAttribute("aria-valuenow")))
    .toBeCloseTo(-6);
  await expect(waveform).not.toHaveAttribute("d", originalPath!);
});
