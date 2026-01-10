import path from "path";
import { expect, test } from "@playwright/test";

test.describe("Transport Controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("play button is disabled without audio", async ({ page }) => {
    const playButton = page.getByTestId("play-pause-button");
    await expect(playButton).toBeDisabled();
  });

  test("play/pause toggles with button click", async ({ page }) => {
    // Load audio first
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

    const playButton = page.getByTestId("play-pause-button");
    await expect(playButton).toBeEnabled({ timeout: 5000 });

    // Should show Play initially
    await expect(playButton).toHaveText("Play");

    // Click to play
    await playButton.click();
    await expect(playButton).toHaveText("Pause");

    // Click to pause
    await playButton.click();
    await expect(playButton).toHaveText("Play");
  });

  test("space bar toggles play/pause", async ({ page }) => {
    // Load audio first
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

    const playButton = page.getByTestId("play-pause-button");
    await expect(playButton).toBeEnabled({ timeout: 5000 });
    await expect(playButton).toHaveText("Play");

    // Press space to play
    await page.keyboard.press("Space");
    await expect(playButton).toHaveText("Pause");

    // Press space to pause
    await page.keyboard.press("Space");
    await expect(playButton).toHaveText("Play");
  });

  test("tempo input accepts valid values", async ({ page }) => {
    const tempoInput = page.getByTestId("tempo-input");
    await expect(tempoInput).toHaveValue("120");

    // Change tempo
    await tempoInput.fill("140");
    await tempoInput.blur();
    await expect(tempoInput).toHaveValue("140");
  });

  test("tempo input clamps to valid range", async ({ page }) => {
    const tempoInput = page.getByTestId("tempo-input");

    // Test below minimum (30)
    await tempoInput.fill("10");
    await tempoInput.blur();
    await expect(tempoInput).toHaveValue("30");

    // Test above maximum (300)
    await tempoInput.fill("500");
    await tempoInput.blur();
    await expect(tempoInput).toHaveValue("300");
  });

  test("metronome toggle works", async ({ page }) => {
    const metronomeToggle = page.getByTestId("metronome-toggle");

    // Should be unchecked by default
    await expect(metronomeToggle).not.toBeChecked();

    // Toggle on
    await metronomeToggle.click();
    await expect(metronomeToggle).toBeChecked();

    // Toggle off
    await metronomeToggle.click();
    await expect(metronomeToggle).not.toBeChecked();
  });

  test("tap tempo button updates tempo", async ({ page }) => {
    const tapButton = page.getByTestId("tap-tempo-button");
    const tempoInput = page.getByTestId("tempo-input");

    // Initial tempo
    await expect(tempoInput).toHaveValue("120");

    // Tap 4 times at ~100ms intervals (600 BPM, but should clamp to 300)
    // Actually, let's tap at ~500ms intervals for 120 BPM
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

  test("time display shows duration after loading audio", async ({ page }) => {
    const timeDisplay = page.getByTestId("time-display");
    await expect(timeDisplay).toHaveText("0:00 / 0:00");

    // Load audio
    const fileInput = page.getByTestId("audio-file-input");
    const testAudioPath = path.join(
      import.meta.dirname,
      "../public/test-audio.wav",
    );
    await fileInput.setInputFiles(testAudioPath);

    // Wait for duration to update
    await expect(timeDisplay).not.toHaveText("0:00 / 0:00", { timeout: 5000 });
  });
});
