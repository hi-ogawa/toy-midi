import { expect, test } from "@playwright/test";
import {
  addRecorderAudio,
  createRecorderProject,
  dragBy,
  seekRecorderByPixels,
} from "./recorder-helpers";

test("keeps recorder clip and locator selection domains exclusive", async ({
  page,
}) => {
  await createRecorderProject(page);
  const pixelsPerBeat = 80;
  const add = page.getByRole("button", { name: "Add locator at playhead" });
  const marker = page.getByRole("button", { name: "Section 1", exact: true });
  await seekRecorderByPixels(page, pixelsPerBeat * 4);
  await add.click();

  // Selecting a locator after a waveform makes Delete remove only the locator.
  await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");
  const audio = page.getByTestId("recorder-clip-audio");
  await audio.click();
  await expect(audio).toHaveAttribute("data-selected", "true");
  await marker.click();
  await expect(audio).not.toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Delete");
  await expect(marker).toHaveCount(0);
  await expect(audio).toBeVisible();

  // Creation also clears clip selection, and clip drag/trim clear locators.
  await audio.click();
  await seekRecorderByPixels(page, pixelsPerBeat * 8);
  await add.click();
  await expect(marker).toHaveAttribute("aria-pressed", "true");
  await expect(audio).not.toHaveAttribute("data-selected", "true");
  await dragBy(page, audio, 20);
  await expect(marker).toHaveAttribute("aria-pressed", "false");
  await expect(audio).toHaveAttribute("data-selected", "true");
  await marker.click();
  await dragBy(page, audio.getByTestId("recorder-take-trim-end"), -10);
  await expect(marker).toHaveAttribute("aria-pressed", "false");

  // Selecting a waveform after a locator makes Delete remove only the clip.
  await marker.click();
  await audio.click();
  await expect(marker).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Delete");
  await expect(audio).toHaveCount(0);
  await expect(marker).toBeVisible();
});
