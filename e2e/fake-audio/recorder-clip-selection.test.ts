import { expect, test } from "@playwright/test";
import {
  addRecorderAudio,
  createRecorderProject,
  enableInput,
  seekRecorderByPixels,
  waitForRecordingSamples,
} from "./recorder-helpers";

test("selects and moves audio and take clips together", async ({ page }) => {
  await createRecorderProject(page);

  // Import a backing track.
  await addRecorderAudio({ page, filePath: "e2e/fixtures/test-audio.wav" });
  const audio = page.getByTestId("recorder-clip-audio");

  // Record a take away from zero.
  await enableInput(page);
  await seekRecorderByPixels(page, 160);
  const recordButton = page.getByTestId("recorder-record-button");
  await recordButton.click();
  await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));
  await recordButton.click();
  const take = page.getByTestId("recorder-clip-take");
  await expect(take).toBeVisible();

  // Ctrl-click adds the take to the selected backing track.
  await audio.click();
  await take.click({ modifiers: ["Control"] });
  await expect(audio).toHaveAttribute("data-selected", "true");
  await expect(take).toHaveAttribute("data-selected", "true");

  // Dragging either selected clip moves the whole selection.
  const audioBefore = await audio.boundingBox();
  const takeBefore = await take.boundingBox();
  expect(audioBefore).not.toBeNull();
  expect(takeBefore).not.toBeNull();
  const takeCenter = {
    x: takeBefore!.x + takeBefore!.width / 2,
    y: takeBefore!.y + takeBefore!.height / 2,
  };
  await page.mouse.move(takeCenter.x, takeCenter.y);
  await page.mouse.down();
  await page.mouse.move(takeCenter.x + 80, takeCenter.y, { steps: 4 });
  await page.mouse.up();

  // Both clips preserve their relative spacing through the shared movement.
  const audioAfter = await audio.boundingBox();
  const takeAfter = await take.boundingBox();
  expect(audioAfter!.x - audioBefore!.x).toBeCloseTo(80, -1);
  expect(takeAfter!.x - takeBefore!.x).toBeCloseTo(80, -1);

  // Delete clears every selected clip while preserving the audio track row.
  await page.keyboard.press("Delete");
  await expect(audio).toHaveCount(0);
  await expect(take).toHaveCount(0);
  await expect(page.getByText("Load an audio file")).toBeVisible();
  await expect(page.getByText("No file loaded")).toBeVisible();
});
