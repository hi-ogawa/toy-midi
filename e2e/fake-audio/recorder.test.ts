import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createRecorderProject } from "../helpers";

test.beforeEach(async ({ page }) => {
  await createRecorderProject(page);
});

test("uploads and plays a backing track", async ({ page }) => {
  // The musician loads a backing track through the recorder's file picker.
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("recorder-add-audio-file").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles("e2e/fixtures/test-audio.wav");

  // Decoding produces both a named timeline clip and its waveform preview.
  const clip = page.getByTestId("recorder-clip-audio");
  await expect(clip).toContainText("test-audio.wav");
  await expect(clip.locator("svg")).toBeVisible();

  // Backing audio supports the same non-destructive move and trim workflow.
  const beforeEdit = await clip.boundingBox();
  expect(beforeEdit).not.toBeNull();
  await dragBy(page, clip, 80);
  const afterMove = await clip.boundingBox();
  expect(afterMove).not.toBeNull();
  expect(afterMove!.x).toBeCloseTo(beforeEdit!.x + 80, -1);

  const trimPixels = afterMove!.width / 4;
  await dragBy(page, clip.getByTestId("recorder-take-trim-start"), trimPixels);
  const afterStartTrim = await clip.boundingBox();
  expect(afterStartTrim).not.toBeNull();
  expect(afterStartTrim!.x).toBeCloseTo(afterMove!.x + trimPixels, -1);
  expect(afterStartTrim!.x + afterStartTrim!.width).toBeCloseTo(
    afterMove!.x + afterMove!.width,
    -1,
  );

  await dragBy(page, clip.getByTestId("recorder-take-trim-end"), -trimPixels);
  const afterEndTrim = await clip.boundingBox();
  expect(afterEndTrim).not.toBeNull();
  expect(afterEndTrim!.x).toBeCloseTo(afterStartTrim!.x, -1);
  expect(afterEndTrim!.width).toBeCloseTo(
    afterStartTrim!.width - trimPixels,
    -1,
  );

  // Playback rolls the shared transport and can be paused from its new position.
  const playButton = page.getByTestId("recorder-play-button");
  const position = page.getByTestId("recorder-position");
  await expect(position).toHaveText("01|01 - 00:00.000");
  await playButton.click();
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await expect(position).not.toHaveText("01|01 - 00:00.000");
  await playButton.click();
  await expect(playButton).toHaveAttribute("aria-pressed", "false");

  // Deleting the selected clip preserves the empty audio track row.
  await clip.dispatchEvent("click");
  await expect(clip).toHaveClass(/border-sky-300/);
  await page.keyboard.press("Delete");
  await expect(clip).toHaveCount(0);
  await expect(page.getByText("Load an audio file")).toBeVisible();
  await expect(page.getByText("No file loaded")).toBeVisible();
});

test("selects and moves audio and take clips together", async ({ page }) => {
  // The musician imports a backing track.
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("recorder-add-audio-file").click();
  await (await fileChooserPromise).setFiles("e2e/fixtures/test-audio.wav");
  const audio = page.getByTestId("recorder-clip-audio");
  await expect(audio).toBeVisible();

  // They record a take away from zero.
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

test("records, plays, and manages multiple takes", async ({ page }) => {
  // The musician connects the browser input before recording is available.
  await enableInput(page);

  // They place the playhead away from zero so take placement is exercised too.
  await seekRecorderByPixels(page, 160);

  // Recording starts capture and rolls the stopped transport.
  const recordButton = page.getByTestId("recorder-record-button");
  const playButton = page.getByTestId("recorder-play-button");
  const position = page.getByTestId("recorder-position");
  const captureActions = page.getByRole("button", { name: "Capture actions" });
  await captureActions.click();
  await expect(page.getByTestId("recorder-download-take")).toBeDisabled();
  await page.keyboard.press("Escape");
  await recordButton.click();
  await expect(recordButton).toHaveAttribute("aria-pressed", "true");
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  const recording = page.getByTestId("recorder-clip-recording");
  await expect(recording).toContainText("Recording...");
  await waitForRecordingSamples(recording);

  // Stopping flushes the worklet and finalizes a nonempty waveform-backed take.
  await recordButton.click();
  await expect(recordButton).toHaveAttribute("aria-pressed", "false");
  await expect(playButton).toHaveAttribute("aria-pressed", "false");
  const take = page.getByTestId("recorder-clip-take");
  const compRegion = page.getByTestId("recorder-comp-region");
  await expect(take).toHaveAttribute("aria-label", "Take 1");
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

  // They move later in the song and record another attempt.
  await seekRecorderByPixels(page, 320);
  await recordButton.click();
  const secondRecording = page.getByTestId("recorder-clip-recording");
  await expect(secondRecording).toContainText("Recording...");
  await waitForRecordingSamples(secondRecording);
  await recordButton.click();

  // The second recording is retained as a new source take.
  await expect(take).toHaveCount(2);
  await expect(take.nth(0)).toHaveAttribute("aria-label", "Take 1");
  await expect(take.nth(1)).toHaveAttribute("aria-label", "Take 2");
  expect(
    Number.parseFloat(
      await take.nth(1).evaluate((element) => element.style.left),
    ),
  ).toBeCloseTo(320, -2);

  // Selecting a source take does not seek, and Escape clears the selection.
  const positionBeforeSelection = await position.textContent();
  await take.nth(0).click();
  await expect(position).toHaveText(positionBeforeSelection!);
  await expect(take.nth(0)).toHaveClass(/border-sky-300/);
  await page.keyboard.press("Escape");
  await expect(take.nth(0)).not.toHaveClass(/border-sky-300/);

  // Delete removes every selected source take together.
  await take.nth(0).click();
  await take.nth(1).click({ modifiers: ["Control"] });
  await page.keyboard.press("Delete");
  await expect(take).toHaveCount(0);
  await expect(page.getByText("No takes")).toBeVisible();
});

async function seekRecorderByPixels(page: Page, pixels: number) {
  const ruler = page.getByTestId("recorder-timeline-ruler");
  const box = await ruler.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + pixels, box!.y + box!.height / 2);
}

async function dragBy(page: Page, locator: Locator, deltaX: number) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + deltaX,
    box!.y + box!.height / 2,
    { steps: 4 },
  );
  await page.mouse.up();
}

async function waitForRecordingSamples(recording: Locator) {
  const initialWidth = await recording.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  await expect
    .poll(() =>
      recording.evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBeGreaterThan(initialWidth);
}

async function enableInput(page: Page) {
  // Fake audio still exercises permission, device discovery, and channel setup.
  const route = page.getByRole("button", {
    name: "Fake Default Audio Input · Input 1",
  });
  await expect(page.getByTestId("recorder-input-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await route.click();
  await expect(
    page.getByRole("heading", { name: "Audio Input Setup" }),
  ).toBeVisible();
  const setup = page.getByTestId("recorder-input-setup");
  await setup.getByRole("button", { name: "Enable input" }).click();
  await expect(
    setup.getByRole("button", { name: "Disable input" }),
  ).toBeVisible();
  await expect(page.getByLabel("Device")).toContainText(
    "Fake Default Audio Input",
  );
  await expect(page.getByLabel("Channel")).toContainText("Channel 1");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(
    page.getByRole("button", {
      name: "Fake Default Audio Input · Input 1",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("recorder-input-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}
