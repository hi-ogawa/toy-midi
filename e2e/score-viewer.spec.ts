import path from "node:path";
import { expect, Page, test } from "@playwright/test";

test("navigates between projects and the score viewer", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("score-viewer-link").click();
  await expect(page).toHaveURL(/\/score-viewer$/);

  await page.getByRole("button", { name: "More" }).click();
  await page.getByTestId("all-projects-menu-item").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("startup-screen")).toBeVisible();
});

test("renders and plays a Toy MIDI MusicXML export", async ({ page }) => {
  await page.goto("/score-viewer");
  await page
    .getByLabel("Upload MusicXML")
    .setInputFiles(
      path.resolve("src/lib/__snapshots__/five-string-tab.musicxml"),
    );

  await expect(page.getByText("five-string-tab.musicxml")).toBeVisible();
  await expect(
    page.getByTestId("score-viewer-renderer").locator("svg"),
  ).toBeVisible();
  await expect(page.getByLabel("BPM")).toHaveValue("120");
  await expect(page.getByRole("button", { name: "Play" })).toBeEnabled();

  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByLabel("BPM").press("Space");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
});

test("loads and advances the cursor sample", async ({ page }) => {
  await page.goto("/score-viewer");
  await loadSample(page, "Cursor and wrapping");

  const playButton = page.getByRole("button", { name: "Play" });
  await expect(playButton).toBeEnabled();
  const cursor = page.getByTestId("score-viewer-cursor");
  const position = page.getByText("01|01");
  await expect(cursor).toBeVisible();
  await expect(position).toBeVisible();
  const initialTransform = await cursor.evaluate(
    (element) => element.style.transform,
  );

  await playButton.click();
  await page.waitForTimeout(100);
  const firstTransform = await cursor.evaluate(
    (element) => element.style.transform,
  );
  await page.waitForTimeout(100);
  const secondTransform = await cursor.evaluate(
    (element) => element.style.transform,
  );
  expect(secondTransform).not.toBe(firstTransform);
  await expect
    .poll(() => cursor.evaluate((element) => element.style.transform))
    .not.toBe(initialTransform);

  await page.getByRole("button", { name: "Pause" }).click();
  await page.locator('[data-measure-index="1"]').click();
  await expect(page.getByText("02|01")).toBeVisible();
  const seekTransform = await cursor.evaluate(
    (element) => element.style.transform,
  );
  expect(seekTransform).not.toBe(initialTransform);

  await page.getByLabel("BPM").fill("120");
  await page.getByLabel("BPM").press("Enter");
  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(100);
  const fastTransform = await cursor.evaluate(
    (element) => element.style.transform,
  );
  expect(fastTransform).not.toBe(seekTransform);

  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByLabel("BPM").fill("60");
  await page.getByLabel("BPM").press("Enter");
  await page.locator('[data-measure-index="3"]').click();
  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(100);
  const systemEndStart = await cursor.evaluate(
    (element) => element.style.transform,
  );
  await page.waitForTimeout(200);
  const systemEndLater = await cursor.evaluate(
    (element) => element.style.transform,
  );
  expect(systemEndLater).not.toBe(systemEndStart);
  await expect(cursor).toHaveAttribute("data-system-id", "0");
  await expect.poll(() => cursor.getAttribute("data-system-id")).toBe("1");
});

test("switches between generated score samples", async ({ page }) => {
  await page.goto("/score-viewer");

  await loadSample(page, "Dense sixteenths");
  await expect(page.getByTestId("score-name")).toHaveText("Dense sixteenths");
  await expect(page.getByLabel("BPM")).toHaveValue("110");
  await expect(
    page.getByTestId("score-viewer-renderer").locator("svg"),
  ).toBeVisible();

  await loadSample(page, "Fast eighths");
  await expect(page.getByTestId("score-name")).toHaveText("Fast eighths");
  await expect(page.getByLabel("BPM")).toHaveValue("200");
});

test("seeks to the start of a clicked measure", async ({ page }) => {
  await page.goto("/score-viewer");
  await loadSample(page, "Cursor and wrapping");

  const renderer = page.getByTestId("score-viewer-renderer");
  const thirdMeasure = page.locator(
    '[data-testid="score-viewer-measure"][data-measure-index="2"]',
  );
  await expect(thirdMeasure).toBeVisible();
  await thirdMeasure.click({ position: { x: 20, y: 20 } });

  await expect(page.getByText("03|01")).toBeVisible();
  await expect(renderer).toBeVisible();
});

test("switches score layout", async ({ page }) => {
  await page.goto("/score-viewer");
  await loadSample(page, "Long score");

  const renderer = page.getByTestId("score-viewer-renderer");
  await page.getByLabel("Layout").selectOption("paged");
  await expect(page.getByLabel("Layout")).toHaveValue("paged");
  await expect.poll(() => renderer.locator("svg").count()).toBeGreaterThan(1);
  const firstPageMeasure = page.locator(
    '[data-testid="score-viewer-measure"][data-measure-index="0"]',
  );
  const secondPageMeasure = page.locator(
    '[data-testid="score-viewer-measure"][data-measure-index="16"]',
  );
  await expect(secondPageMeasure).toBeVisible();
  expect((await secondPageMeasure.boundingBox())!.y).toBeGreaterThan(
    (await firstPageMeasure.boundingBox())!.y,
  );
  const firstSystemMeasures = await page
    .getByTestId("score-viewer-measure")
    .evaluateAll((elements) =>
      elements.slice(0, 4).map((element) => ({
        index: element.getAttribute("data-measure-index"),
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
      })),
    );
  expect(firstSystemMeasures.map(({ index }) => index)).toEqual([
    "0",
    "1",
    "2",
    "3",
  ]);
  expect(firstSystemMeasures[1].left).toBeGreaterThan(
    firstSystemMeasures[0].left,
  );
  expect(firstSystemMeasures[0].right).toBeCloseTo(firstSystemMeasures[1].left);
  await secondPageMeasure.click({ position: { x: 20, y: 20 } });
  await expect(page.getByText("17|01")).toBeVisible();
  const cursor = page.getByTestId("score-viewer-cursor");
  const scroll = page.getByTestId("score-viewer-scroll");
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect((await cursor.boundingBox())!.y).toBeGreaterThan(
    (await firstPageMeasure.boundingBox())!.y,
  );

  await page.getByLabel("Layout").selectOption("continuous");
  await expect(page.getByLabel("Layout")).toHaveValue("continuous");
});

async function loadSample(page: Page, name: string) {
  await page.getByRole("button", { name: "Samples" }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${name}`) }).click();
}
