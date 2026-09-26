import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import { useFakeAudioInput } from "./helpers";
import {
  addRecorderAudio,
  createRecorderProject,
  armTrack,
  enableInput,
  getRecorderPosition,
  seekRecorderByPixels,
  waitForRecordingSamples,
} from "./recorder-helpers";

useFakeAudioInput();

test("selects and moves audio and take clips together", async ({ page }) => {
  await createRecorderProject(page);

  // Import a backing track, which lands on a new track after the empty Audio 1.
  await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");
  const rows = page.getByTestId("recorder-audio-track-row");
  const audio = rows.nth(1).getByTestId("recorder-clip-audio-source");

  // Record a take into Audio 1 away from zero.
  await enableInput(page);
  await armTrack(page, { track: "Audio 1" });
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 2);
  const recordButton = page.getByTestId("recorder-record-button");
  await recordButton.click();
  await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));
  await recordButton.click();
  const take = rows.nth(0).getByTestId("recorder-clip-audio-source");
  await expect(take).toBeVisible();

  // Ctrl-click adds the take to the selected backing track.
  await audio.click();
  await take.click({ modifiers: ["Control"] });
  await expect(audio).toHaveAttribute("data-selected", "true");
  await expect(take).toHaveAttribute("data-selected", "true");

  // Seek to the start with the time ruler while keeping both clips selected.
  expect(await getRecorderPosition(page)).toBeGreaterThan(0);
  await seekRecorderByPixels(page, 0);
  await expect.poll(() => getRecorderPosition(page)).toBe(0);
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
  await page.mouse.move(takeCenter.x + DEFAULT_PIXELS_PER_BEAT, takeCenter.y, {
    steps: 4,
  });
  await page.mouse.up();

  // Both clips preserve their relative spacing through the shared movement.
  const audioAfter = await audio.boundingBox();
  const takeAfter = await take.boundingBox();
  expect(audioAfter!.x - audioBefore!.x).toBeCloseTo(
    DEFAULT_PIXELS_PER_BEAT,
    -1,
  );
  expect(takeAfter!.x - takeBefore!.x).toBeCloseTo(DEFAULT_PIXELS_PER_BEAT, -1);

  // Delete clears every selected clip while preserving both track rows.
  await page.keyboard.press("Delete");
  await expect(audio).toHaveCount(0);
  await expect(take).toHaveCount(0);
  await expect(page.getByText("Record or import audio")).toHaveCount(2);
  await expect(rows).toHaveCount(2);

  // Undo restores the whole selection at its committed positions in one step.
  await page.keyboard.press("Control+z");
  await expect(audio).toHaveCount(1);
  await expect(take).toHaveCount(1);
  expect((await audio.boundingBox())!.x).toBeCloseTo(audioAfter!.x, -1);
  expect((await take.boundingBox())!.x).toBeCloseTo(takeAfter!.x, -1);

  // Redo removes both clips together and keeps both track rows.
  await page.keyboard.press("Control+Shift+z");
  await expect(audio).toHaveCount(0);
  await expect(take).toHaveCount(0);
  await expect(rows).toHaveCount(2);
});
