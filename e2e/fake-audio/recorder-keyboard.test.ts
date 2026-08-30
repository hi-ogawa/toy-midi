import { expect, test } from "@playwright/test";
import { createRecorderProject, enableInput } from "./recorder-helpers";

test("seeks the recorder by five seconds with arrow keys", async ({ page }) => {
  await createRecorderProject(page);

  const position = page.getByTestId("recorder-position");
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press("ArrowRight");
  }
  const ruler = page.getByTestId("recorder-timeline-ruler");
  const playhead = page.locator(".bg-sky-400");
  const [rulerBox, playheadBox] = await Promise.all([
    ruler.boundingBox(),
    playhead.boundingBox(),
  ]);
  expect(rulerBox).not.toBeNull();
  expect(playheadBox).not.toBeNull();
  expect(playheadBox!.x).toBeGreaterThanOrEqual(rulerBox!.x);
  expect(playheadBox!.x).toBeLessThanOrEqual(rulerBox!.x + rulerBox!.width);

  for (let index = 0; index < 5; index++) {
    await page.keyboard.press("ArrowLeft");
  }
  await expect(position).toHaveText("03|03 - 00:05.000");

  await page.keyboard.press("ArrowLeft");
  await expect(position).toHaveText("01|01 - 00:00.000");
  await page.keyboard.press("ArrowLeft");
  await expect(position).toHaveText("01|01 - 00:00.000");

  const tempoInput = page.getByTestId("recorder-tempo-input");
  await tempoInput.focus();
  await page.keyboard.press("ArrowRight");
  await expect(position).toHaveText("01|01 - 00:00.000");
});

test("keeps playing after seeking and ignores arrows while recording", async ({
  page,
}) => {
  await createRecorderProject(page);

  const playButton = page.getByTestId("recorder-play-button");
  const position = page.getByTestId("recorder-position");
  await playButton.click();
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(position).not.toHaveText("01|01 - 00:00.000");
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await playButton.click();

  await enableInput(page);
  const recordButton = page.getByTestId("recorder-record-button");
  await recordButton.click();
  await expect(recordButton).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(position).not.toContainText("00:05.");
  await recordButton.click();
});
