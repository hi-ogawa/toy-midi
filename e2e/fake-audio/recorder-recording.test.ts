import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  createRecorderProject,
  dragBy,
  enableInput,
  seekRecorderByPixels,
  waitForRecordingSamples,
} from "./recorder-helpers";

test("records, plays, and manages multiple takes", async ({ page }) => {
  await createRecorderProject(page);

  // Connect the browser input before recording is available.
  await enableInput(page);

  // Input monitoring can be enabled before recording starts.
  const monitorButton = page.getByTestId("recorder-input-monitor");
  await expect(monitorButton).toBeEnabled();
  await expect(monitorButton).toHaveAttribute("aria-pressed", "false");
  await monitorButton.click();
  await expect(monitorButton).toHaveAttribute("aria-pressed", "true");

  // Place the playhead away from zero to exercise take placement.
  await seekRecorderByPixels(page, 160);

  // Recording starts capture and rolls the stopped transport.
  const recordButton = page.getByTestId("recorder-record-button");
  const playButton = page.getByTestId("recorder-play-button");
  const position = page.getByTestId("recorder-position");
  const takesToggle = page.getByTestId("recorder-takes-toggle");
  await expect(takesToggle).toHaveAttribute("aria-expanded", "false");
  await expect(takesToggle).toContainText("0");
  const captureActions = page.getByRole("button", { name: "Capture actions" });
  await captureActions.click();
  await expect(page.getByTestId("recorder-download-take")).toBeDisabled();
  await page.keyboard.press("Escape");
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
  const take = page.getByTestId("recorder-clip-take");
  const takeLane = page
    .getByTestId("recorder-take-row")
    .getByTestId("recorder-clip-take-lane");
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
  await captureActions.click();
  await expect(page.getByTestId("recorder-download-take")).toBeEnabled();
  await page.keyboard.press("Escape");
  expect(
    Number.parseFloat(await take.evaluate((element) => element.style.left)),
  ).toBeCloseTo(160, -2);

  // The take can be moved and trimmed without changing its source audio.
  const beforeEdit = await take.boundingBox();
  expect(beforeEdit).not.toBeNull();
  await dragBy(page, take, 80);
  const afterMove = await take.boundingBox();
  expect(afterMove).not.toBeNull();
  expect(afterMove!.x).toBeCloseTo(beforeEdit!.x + 80, -1);

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

  // The resolved recording downloads as a timestamped WAV file.
  const downloadPromise = page.waitForEvent("download");
  await captureActions.click();
  await page.getByTestId("recorder-download-take").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^toy-midi-recording-.*\.wav$/);
  const downloadPath = test.info().outputPath("take.wav");
  await download.saveAs(downloadPath);
  expect(readFileSync(downloadPath).subarray(0, 4).toString()).toBe("RIFF");

  // The completed take immediately joins normal transport playback.
  await playButton.click();
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await playButton.click();

  // Move later in the song and record another attempt.
  await seekRecorderByPixels(page, 320);
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
  ).toBeCloseTo(320, -2);

  // Muting removes a take from Capture without deleting its source lane.
  const muteTake = page.getByTestId("recorder-take-mute");
  await muteTake.nth(1).click();
  await expect(muteTake.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(takeLane).toHaveCount(2);
  await expect(take).toHaveCount(1);
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
  const positionBeforeSelection = await position.textContent();
  await take.nth(0).click();
  await expect(position).toHaveText(positionBeforeSelection!);
  await expect(take.nth(0)).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Escape");
  await expect(take.nth(0)).not.toHaveAttribute("data-selected", "true");

  // Delete removes every selected source take together.
  await take.nth(0).click();
  await takeLane.nth(1).click({ modifiers: ["Control"] });
  await page.keyboard.press("Delete");
  await expect(take).toHaveCount(0);
  await expect(page.getByText("No takes")).toBeVisible();
});
