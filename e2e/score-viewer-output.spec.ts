import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { selectMenuItem } from "./helpers";

const execFileAsync = promisify(execFile);

test("capture score viewer sample cursor", async ({ page }) => {
  await page.goto("/score-viewer");
  await selectMenuItem(page, {
    menu: "Score samples",
    item: /^Cursor and wrapping/,
  });
  const playButton = page.getByRole("button", { name: "Play" });
  await playButton.waitFor({ state: "visible" });
  await page.screenshot({
    path: ".tmp/score-viewer-output-before.png",
  });
  await playButton.click();
  await page.waitForTimeout(1100);
  await page.screenshot({
    path: ".tmp/score-viewer-output-playing.png",
  });
});

test("capture paged score PDF", async ({ page }) => {
  await page.goto("/score-viewer");
  await selectMenuItem(page, { menu: "Score samples", item: /^Long score/ });
  await page.getByRole("button", { name: "Score settings" }).click();
  await page.getByLabel("Layout").selectOption("paged");

  const pages = page.getByTestId("score-viewer-renderer").locator("svg");
  await expect.poll(() => pages.count()).toBeGreaterThan(1);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("score-settings-panel")).not.toBeVisible();
  await page.pdf({
    path: ".tmp/score-viewer-output-paged.pdf",
    format: "A4",
    printBackground: true,
  });
});

test("capture score video", async ({ baseURL }) => {
  // Render a short clip of a MusicXML export through the score video CLI.
  const output = ".tmp/score-viewer-debug-video.mp4";
  fs.rmSync(output, { force: true });
  await execFileAsync("node", [
    "packages/score-video/bin/cli.js",
    "src/lib/musicxml/__snapshots__/five-string-tab.musicxml",
    output,
    "--url",
    baseURL!,
    "--end",
    "2",
  ]);
  expect(fs.existsSync(output)).toBe(true);
});
