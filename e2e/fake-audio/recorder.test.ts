import { open } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/recorder");
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

test("records, plays, and replaces a take", async ({ page }) => {
  // The musician connects the browser input before recording is available.
  await enableInput(page);

  // They place the playhead away from zero so take placement is exercised too.
  await seekRecorderByPixels(page, 160);

  // Recording starts capture and rolls the stopped transport.
  const recordButton = page.getByTestId("recorder-record-button");
  const playButton = page.getByTestId("recorder-play-button");
  const downloadButton = page.getByTestId("recorder-download-take");
  await expect(downloadButton).toBeDisabled();
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
  await expect(downloadButton).toBeEnabled();
  expect(
    Number.parseFloat(await take.evaluate((element) => element.style.left)),
  ).toBeCloseTo(160, -2);

  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^toy-midi-take-1-.*\.wav$/);
  const downloadPath = test.info().outputPath("take.wav");
  await download.saveAs(downloadPath);
  const file = await open(downloadPath);
  const header = Buffer.alloc(4);
  await file.read(header, 0, header.length, 0);
  await file.close();
  expect(header.toString()).toBe("RIFF");

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

  // MVP keeps one take, so the second recording replaces and repositions it.
  await expect(take).toHaveCount(1);
  await expect(take).toContainText("Take 1");
  expect(
    Number.parseFloat(await take.evaluate((element) => element.style.left)),
  ).toBeCloseTo(320, -2);
});

async function seekRecorderByPixels(page: Page, pixels: number) {
  const ruler = page.getByTestId("recorder-timeline-ruler");
  const box = await ruler.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + pixels, box!.y + box!.height / 2);
}

async function enableInput(page: Page) {
  // Fake audio still exercises permission, device discovery, and channel setup.
  const inputButton = page.getByRole("button", { name: "Enable input" });
  await expect(inputButton).toBeVisible();
  await inputButton.click();
  await expect(
    page.getByRole("button", { name: "Disable input" }),
  ).toBeVisible();
  await expect(page.getByLabel("Device")).toContainText(
    "Fake Default Audio Input",
  );
  await expect(page.getByLabel("Channel")).toContainText("Channel 1");
}
