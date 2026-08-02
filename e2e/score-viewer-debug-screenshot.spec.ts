import { test } from "@playwright/test";

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
