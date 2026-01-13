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

test.describe("Audio Output", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("all channels silent when playing empty project", async ({ page }) => {
    // Default state: no notes, no audio file, metronome disabled
    await page.getByTestId("play-pause-button").click();
    await page.waitForTimeout(500);

    await expectChannelSilent(page, "midi");
    await expectChannelSilent(page, "audio");
    await expectChannelSilent(page, "metronome");
  });

  test("metronome produces audio when enabled", async ({ page }) => {
    await page.getByTestId("metronome-toggle").click();
    await expect(page.getByTestId("metronome-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await resetPeakDetection(page);
    await page.getByTestId("play-pause-button").click();

    // Peak tracking for short transient clicks
    await expectPeakDetected(page, "metronome", 3000);
  });

  test("MIDI note produces audio when playing", async ({ page }) => {
    await evaluateStore(page, (store) => {
      store.getState().addNote({
        id: "test-note",
        pitch: 60,
        start: 0,
        duration: 2,
        velocity: 100,
      });
    });

    await page.getByTestId("play-pause-button").click();
    await expectChannelPlaying(page, "midi");
  });

  test("audio track produces audio when playing", async ({ page }) => {
    const fileInput = page.getByTestId("audio-file-input");
    const testAudioPath = path.join(
      import.meta.dirname,
      "../public/test-audio.wav",
    );
    await fileInput.setInputFiles(testAudioPath);
    await page.waitForTimeout(500);

    await page.getByTestId("play-pause-button").click();
    await expectChannelPlaying(page, "audio");
  });
});
