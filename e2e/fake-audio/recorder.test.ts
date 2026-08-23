import { expect, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/recorder");
});

test("uploads and plays a backing track", async ({ page }) => {
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("recorder-add-audio-file").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles("e2e/fixtures/test-audio.wav");

  const clip = page.getByTestId("recorder-clip-audio");
  await expect(clip).toContainText("test-audio.wav");
  await expect(clip.locator("svg")).toBeVisible();

  const playButton = page.getByTestId("recorder-play-button");
  await playButton.click();
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("recorder-position")).not.toContainText(
    "1.1 - 0:00.000",
  );
  await playButton.click();
  await expect(playButton).toHaveAttribute("aria-pressed", "false");
});

test("records and plays a take", async ({ page }) => {
  await enableInput(page);

  const ruler = page.getByTestId("recorder-timeline-ruler");
  const rulerBox = (await ruler.boundingBox())!;
  await page.mouse.click(rulerBox.x + 160, rulerBox.y + rulerBox.height / 2);

  const recordButton = page.getByTestId("recorder-record-button");
  const playButton = page.getByTestId("recorder-play-button");
  await page.keyboard.press("r");
  await expect(recordButton).toHaveAttribute("aria-pressed", "true");
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Recording.+0:00\.[1-9]/)).toBeVisible();

  await page.keyboard.press("r");
  await expect(recordButton).toHaveAttribute("aria-pressed", "false");
  await expect(playButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText(/Take 1.+0:00\.[1-9]/)).toBeVisible();
  const take = page.getByTestId("recorder-clip-take");
  await expect(take).toBeVisible();
  await expect(take.locator("svg")).toBeVisible();

  await page.keyboard.press("Space");
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
});

test("re-recording replaces the previous take", async ({ page }) => {
  await enableInput(page);

  const recordButton = page.getByTestId("recorder-record-button");
  await recordButton.click();
  await expect(page.getByText(/Recording.+0:00\.[1-9]/)).toBeVisible();
  await recordButton.click();
  await expect(page.getByTestId("recorder-clip-take")).toHaveCount(1);

  const ruler = page.getByTestId("recorder-timeline-ruler");
  const rulerBox = (await ruler.boundingBox())!;
  await page.mouse.click(rulerBox.x + 320, rulerBox.y + rulerBox.height / 2);
  await recordButton.click();
  await expect(page.getByText(/Recording.+0:00\.[1-9]/)).toBeVisible();
  await recordButton.click();

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
