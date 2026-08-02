import { expect, test } from "@playwright/test";

test("capture score viewer debug cursor", async ({ page }) => {
  await page.goto("/score-viewer-debug");
  const playButton = page.getByRole("button", { name: "Play" });
  await playButton.waitFor({ state: "visible" });
  await page.screenshot({
    path: "/tmp/opencode/score-viewer-debug-before.png",
  });
  await playButton.click();
  await page.waitForTimeout(2200);
  const screenshot = await page.screenshot({
    path: "/tmp/opencode/score-viewer-debug-playing.png",
  });
  expect(screenshot).toMatchSnapshot("score-viewer-debug-playing.png", {
    maxDiffPixelRatio: 0.01,
  });
});
