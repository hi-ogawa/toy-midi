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
  const cursor = page.locator("img[id^='cursorImg']");
  await expect(cursor).toBeVisible();
  await expect(cursor).toHaveCSS("z-index", "1");
  await expect(page.getByRole("button", { name: "Play" })).toBeEnabled();

  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
});

test("preloads and advances the cursor debug score", async ({ page }) => {
  await page.goto("/score-viewer-debug");

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
});
