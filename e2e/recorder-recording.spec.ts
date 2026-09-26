import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import { useFakeAudioInput } from "./helpers";
import {
  createRecorderProject,
  dragBy,
  armTrack,
  enableInput,
  getRecorderPosition,
  saveRecorderProject,
  seekRecorderByPixels,
  waitForRecordingSamples,
} from "./recorder-helpers";

useFakeAudioInput();

test("records, plays, and manages multiple takes", async ({ page }) => {
  await createRecorderProject(page);

  // Connect the browser input before recording is available.
  await enableInput(page);

  // Monitoring routes through the armed track, so it waits for the arm.
  const monitorButton = page.getByTestId("recorder-input-monitor");
  await expect(monitorButton).toBeDisabled();
  await armTrack(page, { track: "Capture" });

  // Input monitoring can be enabled before recording starts.
  await expect(monitorButton).toBeEnabled();
  await expect(monitorButton).toHaveAttribute("aria-pressed", "false");
  await monitorButton.click();
  await expect(monitorButton).toHaveAttribute("aria-pressed", "true");

  // Place the playhead away from zero to exercise take placement.
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 2);

  // Recording starts capture and rolls the stopped transport.
  const recordButton = page.getByTestId("recorder-record-button");
  const playButton = page.getByTestId("recorder-play-button");
  const takesToggle = page.getByTestId("recorder-takes-toggle");
  await expect(takesToggle).toHaveCount(0);
  await recordButton.click();
  await expect(monitorButton).toHaveAttribute("aria-pressed", "true");
  await expect(recordButton).toHaveAttribute("aria-pressed", "true");
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  const recording = page.getByTestId("recorder-clip-recording");
  await expect(recording).toContainText("Recording...");
  await waitForRecordingSamples(recording);
  await expect(recording.locator("svg")).toBeVisible();

  // Stopping flushes the worklet and finalizes a nonempty waveform-backed take.
  await recordButton.click();
  await expect(recordButton).toHaveAttribute("aria-pressed", "false");
  await expect(playButton).toHaveAttribute("aria-pressed", "false");
  const take = page.getByTestId("recorder-clip-comp-source");
  const takeLane = page
    .getByTestId("recorder-take-row")
    .getByTestId("recorder-clip-take-lane-source");
  const takeRows = page.getByTestId("recorder-take-row");
  const compRegion = page.getByTestId("recorder-clip-comp");
  await expect(takesToggle).toHaveAttribute("aria-expanded", "false");
  await expect(takeRows).toHaveCount(0);
  await expect(take).toHaveCount(1);
  await takesToggle.click();
  await expect(takesToggle).toHaveAttribute("aria-expanded", "true");
  await expect(takeLane).toHaveCount(1);
  await expect(takeRows).toHaveCount(1);
  await expect(compRegion).toContainText("Take 1");
  await expect(compRegion.locator("svg")).toBeVisible();
  expect(
    Number.parseFloat(await take.evaluate((element) => element.style.left)),
  ).toBeCloseTo(DEFAULT_PIXELS_PER_BEAT * 2, -2);

  // TODO: Consider consolidating edit assertions with recorder-clip-move.spec.ts and recorder-clip-trim.spec.ts.
  // The take can be moved and trimmed without changing its source audio.
  const beforeEdit = await take.boundingBox();
  expect(beforeEdit).not.toBeNull();
  await dragBy(page, take, DEFAULT_PIXELS_PER_BEAT);
  const afterMove = await take.boundingBox();
  expect(afterMove).not.toBeNull();
  expect(afterMove!.x).toBeCloseTo(beforeEdit!.x + DEFAULT_PIXELS_PER_BEAT, -1);

  const trimStart = take.getByTestId("recorder-take-trim-start");
  const trimPixels = Math.max(2, afterMove!.width / 4);
  await dragBy(page, trimStart, trimPixels);
  const afterStartTrim = await take.boundingBox();
  expect(afterStartTrim).not.toBeNull();
  expect(afterStartTrim!.x).toBeCloseTo(afterMove!.x + trimPixels, -1);
  expect(afterStartTrim!.x + afterStartTrim!.width).toBeCloseTo(
    afterMove!.x + afterMove!.width,
    -1,
  );

  const trimEnd = take.getByTestId("recorder-take-trim-end");
  await dragBy(page, trimEnd, -trimPixels);
  const afterEndTrim = await take.boundingBox();
  expect(afterEndTrim).not.toBeNull();
  expect(afterEndTrim!.x).toBeCloseTo(afterStartTrim!.x, -1);
  expect(afterEndTrim!.width).toBeCloseTo(
    afterStartTrim!.width - trimPixels,
    -1,
  );

  // The completed take immediately joins normal transport playback.
  await playButton.click();
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await playButton.click();

  // Move later in the song and record another attempt.
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 4);
  await recordButton.click();
  const secondRecording = page.getByTestId("recorder-clip-recording");
  await expect(secondRecording).toContainText("Recording...");
  await waitForRecordingSamples(secondRecording);
  await recordButton.click();

  // The second recording is retained as a new source take.
  await expect(take).toHaveCount(2);
  await expect(takeLane).toHaveCount(2);
  await expect(takeRows).toHaveCount(2);
  expect(
    Number.parseFloat(
      await take.nth(1).evaluate((element) => element.style.left),
    ),
  ).toBeCloseTo(DEFAULT_PIXELS_PER_BEAT * 4, -2);

  // Disarm Capture, which also turns monitoring off because nothing is armed.
  await page
    .getByRole("button", { name: "Disarm Capture for recording", exact: true })
    .click();
  await expect(monitorButton).toHaveAttribute("aria-pressed", "false");
  await expect(monitorButton).toBeDisabled();

  // Show the latest take first by default, then switch to oldest first.
  await expect(takeRows.nth(0)).toContainText("Take 2");
  await expect(takeRows.nth(1)).toContainText("Take 1");
  const takeOrder = page.getByTestId("recorder-takes-order");
  await expect(takeOrder).toHaveAccessibleName("Order takes oldest first");
  await takeOrder.click();
  await expect(takeOrder).toHaveAccessibleName("Order takes newest first");
  await expect(takeRows.nth(0)).toContainText("Take 1");
  await expect(takeRows.nth(1)).toContainText("Take 2");

  // Reload the project and retain the preferred lane order.
  await saveRecorderProject(page);
  await page.reload();
  await expect(takesToggle).toHaveAttribute("aria-expanded", "false");
  await takesToggle.click();
  await expect(takeOrder).toHaveAccessibleName("Order takes newest first");
  await expect(takeRows.nth(0)).toContainText("Take 1");
  await expect(takeRows.nth(1)).toContainText("Take 2");

  // Muting removes a take from Capture without deleting its source lane.
  const muteTake = page.getByTestId("recorder-take-mute");
  await muteTake.nth(1).click();
  await expect(muteTake.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(takeLane).toHaveCount(2);
  await expect(take).toHaveCount(1);
  await expect(compRegion).not.toContainText("Take 2");

  // Move and trim a muted source in its expanded lane while it stays absent from the comp.
  const mutedLane = takeLane.nth(1);
  const beforeSourceMove = (await mutedLane.boundingBox())!;
  await dragBy(page, mutedLane, DEFAULT_PIXELS_PER_BEAT);
  const afterSourceMove = (await mutedLane.boundingBox())!;
  expect(afterSourceMove.x).toBeCloseTo(
    beforeSourceMove.x + DEFAULT_PIXELS_PER_BEAT,
    -1,
  );
  const sourceTrimPixels = Math.max(2, afterSourceMove.width / 4);
  await dragBy(
    page,
    mutedLane.getByTestId("recorder-take-trim-start"),
    sourceTrimPixels,
  );
  const afterSourceTrim = (await mutedLane.boundingBox())!;
  expect(afterSourceTrim.x).toBeCloseTo(
    afterSourceMove.x + sourceTrimPixels,
    -1,
  );
  expect(afterSourceTrim.x + afterSourceTrim.width).toBeCloseTo(
    afterSourceMove.x + afterSourceMove.width,
    -1,
  );
  await expect(
    takeRows.nth(1).getByTestId("recorder-clip-take-lane").locator("svg"),
  ).toBeVisible();
  await expect(compRegion).not.toContainText("Take 2");

  // Solo derives Capture from soloed, unmuted take lanes.
  const soloTake = page.getByTestId("recorder-take-solo");
  await soloTake.nth(1).click();
  await expect(soloTake.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(take).toHaveCount(0);
  await muteTake.nth(1).click();
  await expect(take).toHaveCount(1);
  await soloTake.nth(1).click();
  await expect(take).toHaveCount(2);

  // The source lanes can be folded without changing the resolved comp.
  await takesToggle.click();
  await expect(takesToggle).toHaveAttribute("aria-expanded", "false");
  await expect(takeRows).toHaveCount(0);
  await expect(compRegion).not.toHaveCount(0);
  await takesToggle.click();
  await expect(takeRows).toHaveCount(2);

  // Selecting a source take does not seek, and Escape clears the selection.
  const positionBeforeSelection = await getRecorderPosition(page);
  await take.nth(0).click();
  await expect
    .poll(() => getRecorderPosition(page))
    .toBe(positionBeforeSelection);
  await expect(take.nth(0)).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Escape");
  await expect(take.nth(0)).not.toHaveAttribute("data-selected", "true");

  // Delete removes every selected source take together.
  await take.nth(0).click();
  await takeLane.nth(1).click({ modifiers: ["Control"] });
  await page.keyboard.press("Delete");
  await expect(takesToggle).toHaveCount(0);
  await expect(take).toHaveCount(0);
  await expect(takeRows).toHaveCount(0);

  // Undo restores both source lanes in their original order and rebuilds Capture.
  await page.keyboard.press("Control+z");
  await expect(takeRows).toHaveCount(2);
  await expect(takeRows.nth(0)).toContainText("Take 1");
  await expect(takeRows.nth(1)).toContainText("Take 2");
  await expect(take).toHaveCount(2);
  await expect(compRegion.filter({ hasText: "Take 1" })).toBeVisible();
  await expect(compRegion.filter({ hasText: "Take 2" })).toBeVisible();

  // Redo removes both restored takes with one history action.
  await page.keyboard.press("Control+Shift+z");
  await expect(take).toHaveCount(0);
  await expect(takeRows).toHaveCount(0);
  await expect(compRegion).toHaveCount(0);
});
