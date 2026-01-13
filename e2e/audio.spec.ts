import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  clickNewProject,
  evaluateAudioManager,
  evaluateStore,
} from "./helpers";

test.describe("Audio Output", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  const silent = {
    asymmetricMatch: (actual: number) => actual < 0.0001,
    toString: () => "silent",
  };

  const audible = (threshold = 0.5) => ({
    asymmetricMatch: (actual: number) => actual > threshold,
    toString: () => `audible (> ${threshold})`,
  });

  test("all channels silent when playing empty project", async ({ page }) => {
    await evaluateAudioManager(page, (mgr) => {
      mgr.peakLevels = { midi: 0, audio: 0, metronome: 0 };
    });
    await page.getByTestId("play-pause-button").click();
    await page.waitForTimeout(600);

    const peaks = await evaluateAudioManager(page, (mgr) => mgr.peakLevels);
    expect(peaks).toEqual({ midi: silent, audio: silent, metronome: silent });
  });

  // TODO: fix: metronome mute/unmute has been flaky, so this is flaky.
  test("metronome produces audio when enabled", async ({ page }) => {
    // Lower BPM for more reliable peak detection (beats every 1s instead of 0.5s)
    await evaluateStore(page, (store) => store.getState().setTempo(60));
    await evaluateAudioManager(page, (mgr) => {
      mgr.peakLevels = { midi: 0, audio: 0, metronome: 0 };
    });
    await page.getByTestId("metronome-toggle").click();
    await page.getByTestId("play-pause-button").click();
    await page.waitForTimeout(1100); // Wait for at least 1 beat at 60 BPM

    const peaks = await evaluateAudioManager(page, (mgr) => mgr.peakLevels);
    expect(peaks).toEqual({
      midi: silent,
      audio: silent,
      metronome: audible(),
    });
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
    await evaluateAudioManager(page, (mgr) => {
      mgr.peakLevels = { midi: 0, audio: 0, metronome: 0 };
    });
    await page.getByTestId("play-pause-button").click();
    await page.waitForTimeout(500);

    const peaks = await evaluateAudioManager(page, (mgr) => mgr.peakLevels);
    expect(peaks).toEqual({
      midi: audible(),
      audio: silent,
      metronome: silent,
    });
  });

  test("audio track produces audio when playing", async ({ page }) => {
    const fileInput = page.getByTestId("audio-file-input");
    const testAudioPath = path.join(
      import.meta.dirname,
      "../public/test-audio.wav",
    );
    await fileInput.setInputFiles(testAudioPath);
    await page.waitForTimeout(500);

    await evaluateAudioManager(page, (mgr) => {
      mgr.peakLevels = { midi: 0, audio: 0, metronome: 0 };
    });
    await page.getByTestId("play-pause-button").click();
    await page.waitForTimeout(500);

    const peaks = await evaluateAudioManager(page, (mgr) => mgr.peakLevels);
    expect(peaks).toEqual({
      midi: silent,
      audio: audible(),
      metronome: silent,
    });
  });
});
