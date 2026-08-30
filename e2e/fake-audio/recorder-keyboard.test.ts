import { expect, test } from "@playwright/test";
import { createRecorderProject, enableInput } from "./recorder-helpers";

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
