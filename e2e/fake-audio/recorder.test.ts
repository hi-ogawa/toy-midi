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

test("records and plays a take", async ({ page }) => {
  // The musician connects the browser input before recording is available.
  await enableInput(page);

  // They place the playhead away from zero so take placement is exercised too.
  const ruler = page.getByTestId("recorder-timeline-ruler");
  const rulerBox = (await ruler.boundingBox())!;
  await page.mouse.click(rulerBox.x + 160, rulerBox.y + rulerBox.height / 2);

  // The recording shortcut starts capture and rolls the stopped transport.
  const recordButton = page.getByTestId("recorder-record-button");
  const playButton = page.getByTestId("recorder-play-button");
  await page.keyboard.press("r");
  await expect(recordButton).toHaveAttribute("aria-pressed", "true");
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Recording.+0:00\.[1-9]/)).toBeVisible();

  // Stopping flushes the worklet and finalizes a nonempty waveform-backed take.
  await page.keyboard.press("r");
  await expect(recordButton).toHaveAttribute("aria-pressed", "false");
  await expect(playButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText(/Take 1.+0:00\.[1-9]/)).toBeVisible();
  const take = page.getByTestId("recorder-clip-take");
  await expect(take).toBeVisible();
  await expect(take.locator("svg")).toBeVisible();

  // The completed take immediately joins normal transport playback.
  await page.keyboard.press("Space");
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
});

test("re-recording replaces the previous take", async ({ page }) => {
  await enableInput(page);

  // The musician records an initial take in the default timeline position.
  const recordButton = page.getByTestId("recorder-record-button");
  await recordButton.click();
  await expect(page.getByText(/Recording.+0:00\.[1-9]/)).toBeVisible();
  await recordButton.click();
  await expect(page.getByTestId("recorder-clip-take")).toHaveCount(1);

  // They move later in the song and record another attempt.
  const ruler = page.getByTestId("recorder-timeline-ruler");
  const rulerBox = (await ruler.boundingBox())!;
  await page.mouse.click(rulerBox.x + 320, rulerBox.y + rulerBox.height / 2);
  await recordButton.click();
  await expect(page.getByText(/Recording.+0:00\.[1-9]/)).toBeVisible();
  await recordButton.click();

  // MVP keeps one take, so the second recording replaces and repositions it.
  const take = page.getByTestId("recorder-clip-take");
  await expect(take).toHaveCount(1);
  await expect(take).toContainText("Take 1");
  const left = Number.parseFloat(
    await take.evaluate((element) => element.style.left),
  );
  expect(left).toBeGreaterThan(300);
  expect(left).toBeLessThanOrEqual(320);
});

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
