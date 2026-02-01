import path from "path";
import { expect, test } from "@playwright/test";
import { clickNewProject, evaluateStore } from "./helpers";

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

  test("export and import .toymidi restores project data", async ({ page }) => {
    await evaluateStore(page, (store) => {
      store.getState().addNote({
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      });
      store.getState().addNote({
        id: "note-2",
        pitch: 64,
        start: 1,
        duration: 0.5,
        velocity: 90,
      });
      store.getState().setTempo(123);
      store.getState().setTimeSignature({ numerator: 3, denominator: 4 });
    });

    await openSettings(page);
    const nameInput = page.locator("#settings-project-name");
    await nameInput.fill("Export Import Test");
    await nameInput.press("Enter");

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("export-project-button").click();
    const download = await downloadPromise;
    const downloadPath = test.info().outputPath("export.toymidi");
    await download.saveAs(downloadPath);

    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.getByTestId("startup-screen")).toBeVisible();

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByTestId("import-project-button").click(),
    ]);
    await fileChooser.setFiles(downloadPath);

    await expect(page.getByTestId("transport")).toBeVisible();
    await expect(page).toHaveTitle("Export Import Test - Toy MIDI");

    const notes = await evaluateStore(page, (store) => store.getState().notes);
    expect(notes).toHaveLength(2);
    expect(notes[0].pitch).toBe(60);
    expect(notes[1].pitch).toBe(64);

    const tempo = await evaluateStore(page, (store) => store.getState().tempo);
    expect(tempo).toBe(123);

    const timeSignature = await evaluateStore(
      page,
      (store) => store.getState().timeSignature,
    );
    expect(timeSignature).toEqual({ numerator: 3, denominator: 4 });
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
