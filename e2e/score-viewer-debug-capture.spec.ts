import { expect, test } from "@playwright/test";

test("capture score viewer sample cursor", async ({ page }) => {
  await page.goto("/score-viewer");
  await page.getByRole("button", { name: "Samples" }).click();
  await page.getByRole("menuitem", { name: /^Cursor and wrapping/ }).click();
  const playButton = page.getByRole("button", { name: "Play" });
  await playButton.waitFor({ state: "visible" });
  await page.screenshot({
    path: ".tmp/score-viewer-debug-before.png",
  });
  await playButton.click();
  await page.waitForTimeout(1100);
  await page.screenshot({
    path: ".tmp/score-viewer-debug-playing.png",
  });
});

test("capture paged score PDF", async ({ page }) => {
  await page.goto("/score-viewer");
  await page.getByRole("button", { name: "Samples" }).click();
  await page.getByRole("menuitem", { name: /^Long score/ }).click();
  await page.getByRole("button", { name: "Score settings" }).click();
  await page.getByLabel("Layout").selectOption("paged");

  const pages = page.getByTestId("score-viewer-renderer").locator("svg");
  await expect.poll(() => pages.count()).toBeGreaterThan(1);
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: ".tmp/score-viewer-debug-paged.pdf",
    format: "A4",
    printBackground: true,
  });
});
