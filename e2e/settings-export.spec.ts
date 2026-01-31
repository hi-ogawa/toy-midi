import path from "path";
import { expect, test } from "@playwright/test";
import { clickNewProject } from "./helpers";

// Constants matching piano-roll.tsx
const BEAT_WIDTH = 80;
const ROW_HEIGHT = 20;

test.describe("Settings Dialog - Project Export", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await clickNewProject(page);
  });

  async function openSettings(page: import("@playwright/test").Page) {
    await page.getByTestId("settings-button").click();
    await page.getByTestId("settings-dialog").waitFor({ state: "visible" });
  }

  test("export .toymidi project file", async ({ page }) => {
    // Add a note first
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    await page.mouse.move(
      gridBox.x + BEAT_WIDTH * 1.5,
      gridBox.y + ROW_HEIGHT * 3.5,
    );
    await page.mouse.down();
    await page.mouse.move(
      gridBox.x + BEAT_WIDTH * 3,
      gridBox.y + ROW_HEIGHT * 3.5,
    );
    await page.mouse.up();

    await openSettings(page);

    // Export project
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("export-project-button").click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.toymidi$/);
  });

  test("project export enabled even with no notes", async ({ page }) => {
    await openSettings(page);

    // Project export should be enabled (empty project is valid)
    await expect(page.getByTestId("export-project-button")).toBeEnabled();
  });

  test("import audio file via settings", async ({ page }) => {
    await openSettings(page);

    // Import audio file via file chooser
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByTestId("load-audio-button").click(),
    ]);

    const testAudioPath = path.join(
      import.meta.dirname,
      "../public/test-audio.wav",
    );
    await fileChooser.setFiles(testAudioPath);

    // Wait for audio to load - waveform should be visible
    await page.waitForTimeout(500);
    const waveform = page.locator(".bg-emerald-700, .bg-emerald-600").first();
    await expect(waveform).toBeVisible();
  });
});
