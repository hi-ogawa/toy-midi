import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  clickNewProject,
  evaluateStore,
  expectChannelPlaying,
  expectChannelSilent,
  expectPeakDetected,
  resetPeakDetection,
} from "./helpers";

test.describe("Audio Output - Metronome", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("metronome produces audio output when enabled and playing", async ({
    page,
  }) => {
    // Enable metronome
    await page.getByTestId("metronome-toggle").click();
    await expect(page.getByTestId("metronome-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Reset peak detection before playback
    await resetPeakDetection(page);

    // Start playback
    await page.getByTestId("play-pause-button").click();

    // Should detect metronome clicks via peak tracking
    // (short transients need peak hold, not instant snapshots)
    await expectPeakDetected(page, "metronome", 3000);

    // Stop playback
    await page.getByTestId("play-pause-button").click();
  });

  test("no metronome audio when disabled", async ({ page }) => {
    // Ensure metronome is off (default)
    await expect(page.getByTestId("metronome-toggle")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    // Start playback
    await page.getByTestId("play-pause-button").click();

    // Wait a bit for any potential audio
    await page.waitForTimeout(500);

    // Should remain silent on metronome channel
    await expectChannelSilent(page, "metronome");
  });
});

test.describe("Audio Output - MIDI Track", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("MIDI note produces audio output when playing", async ({ page }) => {
    // Add note programmatically at beat 0 with 2 beat duration
    await evaluateStore(page, (store) => {
      store.getState().addNote({
        id: "test-note",
        pitch: 60,
        start: 0,
        duration: 2,
        velocity: 100,
      });
    });

    // Verify note was created
    const note = page.locator("[data-testid^='note-']");
    await expect(note).toHaveCount(1);

    // Start playback from beginning
    await page.getByTestId("play-pause-button").click();

    // Should detect MIDI synth audio
    await expectChannelPlaying(page, "midi");
  });

  test("no MIDI audio when playing empty project", async ({ page }) => {
    // No notes in project

    // Start playback
    await page.getByTestId("play-pause-button").click();

    // Wait a bit for any potential audio
    await page.waitForTimeout(500);

    // Should remain silent on MIDI channel
    await expectChannelSilent(page, "midi");
  });
});

test.describe("Audio Output - Audio Track", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  async function loadAudioFile(page: import("@playwright/test").Page) {
    const fileInput = page.getByTestId("audio-file-input");
    const testAudioPath = path.join(
      import.meta.dirname,
      "../public/test-audio.wav",
    );
    await fileInput.setInputFiles(testAudioPath);
    await page.waitForTimeout(500); // Wait for audio to load
  }

  test("loaded audio produces output when playing", async ({ page }) => {
    await loadAudioFile(page);

    // Verify waveform loaded (audio region visible)
    const audioRegion = page
      .locator(".bg-emerald-700, .bg-emerald-600")
      .first();
    await expect(audioRegion).toBeVisible();

    // Should be silent before playback
    await expectChannelSilent(page, "audio");

    // Start playback
    await page.getByTestId("play-pause-button").click();

    // Should detect audio track output
    await expectChannelPlaying(page, "audio");
  });

  test("no audio output when no audio file loaded", async ({ page }) => {
    // No audio file loaded

    // Start playback
    await page.getByTestId("play-pause-button").click();

    // Wait a bit for any potential audio
    await page.waitForTimeout(500);

    // Should remain silent on audio channel
    await expectChannelSilent(page, "audio");
  });
});
