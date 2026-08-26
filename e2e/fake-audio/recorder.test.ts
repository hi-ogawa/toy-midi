import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
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

  // Playback rolls the shared transport and can be paused from its new position.
  const playButton = page.getByTestId("recorder-play-button");
  const position = page.getByTestId("recorder-position");
  await expect(position).toHaveText("01|01 - 00:00.000");
  await playButton.click();
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await expect(position).not.toHaveText("01|01 - 00:00.000");
  await playButton.click();
  await expect(playButton).toHaveAttribute("aria-pressed", "false");
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
  const initialWidth = await recording.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  await expect
    .poll(() =>
      recording.evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBeGreaterThan(initialWidth);

  // Stopping flushes the worklet and finalizes a nonempty waveform-backed take.
  await recordButton.click();
  await expect(recordButton).toHaveAttribute("aria-pressed", "false");
  await expect(playButton).toHaveAttribute("aria-pressed", "false");
  const take = page.getByTestId("recorder-clip-take");
  await expect(take).toContainText("Take 1");
  await expect(take.locator("svg")).toBeVisible();
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
  const trimPixels = Math.max(2, afterMove!.width / 4);

  const trimStart = take.getByTestId("recorder-take-trim-start");
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
  await expect(page.getByTestId("recorder-clip-recording")).toContainText(
    "Recording...",
  );
  await recordButton.click();

  // The second recording is retained as a new source take.
  await expect(take).toHaveCount(2);
  await expect(take.nth(0)).toContainText("Take 1");
  await expect(take.nth(1)).toContainText("Take 2");
  expect(
    Number.parseFloat(
      await take.nth(1).evaluate((element) => element.style.left),
    ),
  ).toBeCloseTo(320, -2);

  // Selecting a source take does not seek, and Escape clears the selection.
  const positionBeforeSelection = await position.textContent();
  await take.nth(0).click({ position: { x: 10, y: 10 } });
  await expect(position).toHaveText(positionBeforeSelection!);
  await expect(take.nth(0)).toHaveClass(/border-sky-300/);
  await page.keyboard.press("Escape");
  await expect(take.nth(0)).not.toHaveClass(/border-sky-300/);

  // Deleting a selected source take leaves the other take intact.
  await take.nth(0).click({ position: { x: 10, y: 10 } });
  await page.keyboard.press("Delete");
  await expect(take).toHaveCount(1);
  await expect(take).toContainText("Take 2");
});

async function seekRecorderByPixels(page: Page, pixels: number) {
  const ruler = page.getByTestId("recorder-timeline-ruler");
  const box = await ruler.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + pixels, box!.y + box!.height / 2);
}

async function dragBy(
  page: Page,
  locator: ReturnType<Page["getByTestId"]>,
  deltaX: number,
) {
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
