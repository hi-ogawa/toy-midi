import { test } from "@playwright/test";

test("capture score viewer debug cursor", async ({ page }) => {
  await page.goto("/score-viewer-debug");
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
