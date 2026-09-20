import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import { useFakeAudioInput } from "./helpers";
import {
  addRecorderAudio,
  createRecorderProject,
  enableInput,
  seekRecorderByPixels,
  waitForRecordingSamples,
} from "./recorder-helpers";

useFakeAudioInput();

test("selects and moves audio and take clips together", async ({ page }) => {
  await createRecorderProject(page);

  // Import a backing track.
  await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");
  const audio = page.getByTestId("recorder-clip-audio-source");

  // Record a take away from zero.
  await enableInput(page);
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 2);
  const recordButton = page.getByTestId("recorder-record-button");
  await recordButton.click();
  await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));
  await recordButton.click();
  const take = page.getByTestId("recorder-clip-comp-source");
  await expect(take).toBeVisible();

  // Ctrl-click adds the take to the selected backing track.
  await audio.click();
  await take.click({ modifiers: ["Control"] });
  await expect(audio).toHaveAttribute("data-selected", "true");
  await expect(take).toHaveAttribute("data-selected", "true");

  // Box-select across audio, capture, and the expanded take representation.
  await page.getByTestId("recorder-takes-toggle").click();
  const expandedTake = page.getByTestId("recorder-clip-take-lane-source");
  const audioBox = (await audio.boundingBox())!;
  const expandedBox = (await expandedTake.boundingBox())!;
  await page.keyboard.press("Escape");
  await page.keyboard.down("Shift");
  await page.mouse.move(
    Math.max(audioBox.x + audioBox.width, expandedBox.x + expandedBox.width) +
      15,
    expandedBox.y + expandedBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(audioBox.x + 10, audioBox.y + audioBox.height / 2, {
    steps: 4,
  });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(audio).toHaveAttribute("data-selected", "true");
  await expect(take).toHaveAttribute("data-selected", "true");
  await expect(expandedTake).toHaveAttribute("data-selected", "true");

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

  // Delete clears every selected clip while preserving the audio track row.
  await page.keyboard.press("Delete");
  await expect(audio).toHaveCount(0);
  await expect(take).toHaveCount(0);
  await expect(page.getByText("Load an audio file")).toBeVisible();
  await expect(page.getByTestId("recorder-audio-track-row")).toBeVisible();

  // Undo restores the whole selection at its committed positions in one step.
  await page.keyboard.press("Control+z");
  await expect(audio).toHaveCount(1);
  await expect(take).toHaveCount(1);
  expect((await audio.boundingBox())!.x).toBeCloseTo(audioAfter!.x, -1);
  expect((await take.boundingBox())!.x).toBeCloseTo(takeAfter!.x, -1);

  // Redo removes both clips together and keeps the backing track row.
  await page.keyboard.press("Control+Shift+z");
  await expect(audio).toHaveCount(0);
  await expect(take).toHaveCount(0);
  await expect(page.getByTestId("recorder-audio-track-row")).toBeVisible();
});

test("box selection replaces clips, cancels, and preserves click-to-seek", async ({
  page,
}) => {
  // Import two audio tracks and place the playhead before selecting.
  await createRecorderProject(page);
  await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");
  await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");
  const clips = page.getByTestId("recorder-clip-audio-source");
  const first = clips.nth(0);
  const second = clips.nth(1);
  const firstBox = (await first.boundingBox())!;
  const secondBox = (await second.boundingBox())!;
  const right = firstBox.x + firstBox.width + 20;
  const firstY = firstBox.y + firstBox.height / 2;
  const secondY = secondBox.y + secondBox.height / 2;
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT);
  const playhead = page.getByTestId("recorder-playhead");
  const playheadBefore = (await playhead.boundingBox())!;
  await first.click();

  // Cancel a cross-lane box and keep the previous selection through release.
  await page.keyboard.down("Shift");
  await page.mouse.move(right, firstY);
  await page.mouse.down();
  await page.mouse.move(firstBox.x + firstBox.width / 2, secondY, { steps: 4 });
  const preview = page.getByTestId("recorder-clip-box-selection");
  await expect(preview).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await page.mouse.move(firstBox.x + 10, secondY);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(first).toHaveAttribute("data-selected", "true");
  await expect(second).not.toHaveAttribute("data-selected", "true");

  // Replace selection with a partial overlap of only the second clip.
  await page.keyboard.down("Shift");
  await page.mouse.move(right, secondBox.y + 1);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + secondBox.width / 2, secondY, {
    steps: 4,
  });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(first).not.toHaveAttribute("data-selected", "true");
  await expect(second).toHaveAttribute("data-selected", "true");
  expect((await playhead.boundingBox())!.x).toBeCloseTo(playheadBefore.x, 1);

  // Clear selection with an empty box drawn in the opposite direction.
  await page.keyboard.down("Shift");
  await page.mouse.move(right, firstY);
  await page.mouse.down();
  await page.mouse.move(right + 20, secondY, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(first).not.toHaveAttribute("data-selected", "true");
  await expect(second).not.toHaveAttribute("data-selected", "true");

  // Click empty lane space normally to seek.
  await page.mouse.click(right, firstY);
  expect((await playhead.boundingBox())!.x).toBeGreaterThan(playheadBefore.x);

  // Zoom and pan, then select across the clipped left edge in the new viewport.
  await page.mouse.move(right, firstY);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect
    .poll(async () => (await first.boundingBox())!.width)
    .toBeGreaterThan(firstBox.width);
  const zoomed = (await first.boundingBox())!;
  await page.mouse.wheel(100, 0);
  await expect
    .poll(async () => (await first.boundingBox())!.x)
    .toBeLessThan(zoomed.x);
  const panned = (await first.boundingBox())!;
  const lane = (await first.locator("..").boundingBox())!;
  await page.keyboard.down("Shift");
  await page.mouse.move(panned.x + panned.width + 15, firstY);
  await page.mouse.down();
  await page.mouse.move(lane.x + 5, secondY, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(first).toHaveAttribute("data-selected", "true");
  await expect(second).toHaveAttribute("data-selected", "true");
});
