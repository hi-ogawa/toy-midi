import { expect, test } from "@playwright/test";
import { createCheckpoint } from "../helpers";
import {
  createRecorderProject,
  enableInput,
  seekRecorderByPixels,
} from "./recorder-helpers";

test("snaps recorder timeline seeking to the selected grid", async ({
  page,
}) => {
  await createRecorderProject(page);

  const pixelsPerBeat = 80;
  const position = page.getByTestId("recorder-position");

  // The default 1/16 grid has four subdivisions per beat, so 0.9 beats snaps
  // to beat 1 rather than the adjacent 0.75-beat grid point.
  await seekRecorderByPixels(page, pixelsPerBeat * 0.9);
  await expect(position).toHaveText("01|02 - 00:00.500");

  // On the 1/4 grid, 0.4 beats rounds back to beat 0 rather than seeking to
  // the raw pointer position.
  await page.getByRole("button", { name: "1/16" }).click();
  await page.getByRole("menuitemradio", { name: "1/4" }).click();
  await seekRecorderByPixels(page, pixelsPerBeat * 0.4);
  await expect(position).toHaveText("01|01 - 00:00.000");
});

test("seeks the recorder by five seconds with arrow keys", async ({ page }) => {
  await createRecorderProject(page);

  // Plain arrows move in five-second steps and clamp at the timeline start.
  const position = page.getByTestId("recorder-position");
  await page.keyboard.press("ArrowRight");
  await expect(position).toHaveText("03|03 - 00:05.000");

  await page.keyboard.press("ArrowLeft");
  await expect(position).toHaveText("01|01 - 00:00.000");
  await page.keyboard.press("ArrowLeft");
  await expect(position).toHaveText("01|01 - 00:00.000");

  // Focused text controls retain their native arrow-key behavior.
  const tempoInput = page.getByTestId("recorder-tempo-input");
  await tempoInput.focus();
  await page.keyboard.press("ArrowRight");
  await expect(position).toHaveText("01|01 - 00:00.000");

  // Seeking during playback restarts participants and keeps the transport rolling.
  await tempoInput.blur();
  const playButton = page.getByTestId("recorder-play-button");
  await playButton.click();
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await playButton.click();
  await expect(position).toContainText(/00:0[5-9]\.|00:[1-5]\d\./);

  // Recording owns transport timing, so arrows cannot seek an active capture.
  await enableInput(page);
  const recordButton = page.getByTestId("recorder-record-button");
  await recordButton.click();
  await expect(recordButton).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(position).not.toContainText("00:05.");
  await recordButton.click();
});

test("advances recorder position at the selected playback rate", async ({
  page,
}) => {
  const checkpoint = createCheckpoint();
  await createRecorderProject(page);

  await page.getByTestId("recorder-playback-rate").click();
  await page.getByRole("menuitemradio", { name: "0.5x" }).click();
  const position = page.getByTestId("recorder-position");
  const sample = () =>
    position.evaluate((element) => ({
      wallTime: performance.now() / 1_000,
      position: Number(element.dataset.position),
    }));

  await page.getByTestId("recorder-play-button").click();
  const start = await sample();
  await page.waitForTimeout(1_000);
  const end = await sample();
  checkpoint("sample playback clocks");

  const observedRate =
    (end.position - start.position) / (end.wallTime - start.wallTime);
  expect(observedRate).toBeGreaterThan(0.4);
  expect(observedRate).toBeLessThan(0.6);
});
