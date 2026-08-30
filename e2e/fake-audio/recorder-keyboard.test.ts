import { expect, test } from "@playwright/test";
import { createRecorderProject, enableInput } from "./recorder-helpers";

test("seeks the recorder by five seconds with arrow keys", async ({ page }) => {
  await createRecorderProject(page);

  const position = page.getByTestId("recorder-position");
  await page.keyboard.press("ArrowRight");
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
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await playButton.click();
  await expect(position).toContainText(/00:0[5-9]\.|00:[1-5]\d\./);

  await enableInput(page);
  const recordButton = page.getByTestId("recorder-record-button");
  await recordButton.click();
  await expect(recordButton).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(position).not.toContainText("00:05.");
  await recordButton.click();
});
