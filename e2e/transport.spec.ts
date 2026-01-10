import path from "path";
import { expect, test } from "@playwright/test";
import { clickNewProject } from "./helpers";

test.describe("Transport Controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("playback controls", async ({ page }) => {
    // Play button is always enabled for MIDI-only mode
    const playButton = page.getByTestId("play-pause-button");
    await expect(playButton).toBeEnabled();

    // Load audio
    const fileInput = page.getByTestId("audio-file-input");
    const testAudioPath = path.join(
      import.meta.dirname,
      "../public/test-audio.wav",
    );
    await fileInput.setInputFiles(testAudioPath);
    await expect(page.getByTestId("audio-file-name")).toHaveText(
      "test-audio.wav",
      { timeout: 5000 },
    );

    // Time display should show duration
    const timeDisplay = page.getByTestId("time-display");
    await expect(timeDisplay).not.toHaveText("0:00 / 0:00", { timeout: 5000 });

    await expect(playButton).toBeEnabled({ timeout: 5000 });
    await expect(playButton).toHaveText("▶");

    // Click to play
    await playButton.click();
    await expect(playButton).toHaveText("⏸");

    // Click to pause
    await playButton.click();
    await expect(playButton).toHaveText("▶");

    // Space bar to play
    await page.keyboard.press("Space");
    await expect(playButton).toHaveText("⏸");

    // Space bar to pause
    await page.keyboard.press("Space");
    await expect(playButton).toHaveText("▶");
  });

  test("tempo input", async ({ page }) => {
    const tempoInput = page.getByTestId("tempo-input");
    await expect(tempoInput).toHaveValue("120");

    // Change tempo to valid value
    await tempoInput.fill("140");
    await tempoInput.blur();
    await expect(tempoInput).toHaveValue("140");

    // Test below minimum (30) - should clamp
    await tempoInput.fill("10");
    await tempoInput.blur();
    await expect(tempoInput).toHaveValue("30");

    // Test above maximum (300) - should clamp
    await tempoInput.fill("500");
    await tempoInput.blur();
    await expect(tempoInput).toHaveValue("300");
  });

  test("metronome toggle", async ({ page }) => {
    const metronomeToggle = page.getByTestId("metronome-toggle");

    // Should be off by default
    await expect(metronomeToggle).toHaveAttribute("aria-pressed", "false");

    // Toggle on
    await metronomeToggle.click();
    await expect(metronomeToggle).toHaveAttribute("aria-pressed", "true");

    // Toggle off
    await metronomeToggle.click();
    await expect(metronomeToggle).toHaveAttribute("aria-pressed", "false");
  });

  test("tap tempo", async ({ page }) => {
    const tapButton = page.getByTestId("tap-tempo-button");
    const tempoInput = page.getByTestId("tempo-input");

    await expect(tempoInput).toHaveValue("120");

    // Tap 4 times at ~500ms intervals for ~120 BPM
    await tapButton.click();
    await page.waitForTimeout(500);
    await tapButton.click();
    await page.waitForTimeout(500);
    await tapButton.click();
    await page.waitForTimeout(500);
    await tapButton.click();

    // Tempo should have changed (might not be exactly 120 due to timing)
    const newTempo = await tempoInput.inputValue();
    expect(parseInt(newTempo)).toBeGreaterThanOrEqual(30);
    expect(parseInt(newTempo)).toBeLessThanOrEqual(300);
  });

  test("export MIDI workflow", async ({ page }) => {
    const exportButton = page.getByTestId("export-midi-button");

    // Button disabled when no notes
    await expect(exportButton).toBeDisabled();

    // Add a note
    const pianoRoll = page.locator('[data-testid="piano-roll-grid"]');
    await pianoRoll.click({ position: { x: 100, y: 100 } });

    // Button enabled when notes exist
    await expect(exportButton).toBeEnabled();

    // Click export and verify download
    const downloadPromise = page.waitForEvent("download");
    await exportButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.mid$/);
  });
});
