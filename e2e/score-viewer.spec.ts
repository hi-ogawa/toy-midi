import path from "node:path";
import { expect, test } from "@playwright/test";

test("renders and plays a Toy MIDI MusicXML export", async ({ page }) => {
  await page.goto("/score-viewer");
  await page
    .getByLabel("Open MusicXML")
    .setInputFiles(
      path.resolve("src/lib/__snapshots__/five-string-tab.musicxml"),
    );

  await expect(page.getByText("five-string-tab.musicxml")).toBeVisible();
  await expect(
    page.getByTestId("score-viewer-renderer").locator("svg"),
  ).toBeVisible();
  const cursor = page.getByTestId("continuous-playback-cursor");
  await expect(cursor).toBeVisible();
  await expect(page.getByLabel("BPM")).toHaveValue("120");
  await expect(page.getByLabel("Measure width")).toHaveValue("1");
  await expect(page.getByRole("button", { name: "Play" })).toBeEnabled();

  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();

  await page.getByLabel("Measure width").fill("0.75");
  await page.getByLabel("Measure width").press("Enter");
  await expect(page.getByLabel("Measure width")).toHaveValue("0.75");
  await expect(
    page.getByTestId("score-viewer-renderer").locator("svg"),
  ).toHaveCount(2);
});

test("loads and advances the cursor sample", async ({ page }) => {
  await page.goto("/score-viewer");
  await loadSample(page, "Cursor and wrapping");

  const playButton = page.getByRole("button", { name: "Play" });
  await expect(playButton).toBeEnabled();
  const cursor = page.getByTestId("continuous-playback-cursor");
  await expect(cursor).toBeVisible();
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
  await page.getByLabel("Bar").fill("2");
  await page.getByLabel("Beat").fill("3");
  await page.getByLabel("Beat").press("Enter");
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
  await page.getByLabel("Bar").fill("3");
  await page.getByLabel("Beat").fill("4");
  await page.getByLabel("Beat").press("Enter");
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

async function loadSample(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: "Samples" }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${name}`) }).click();
}
