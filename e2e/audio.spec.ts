import path from "node:path";
import { expect, test } from "@playwright/test";
import { clickNewProject, evaluateStore, isChannelPlaying } from "./helpers";

test.describe("Audio Output", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("all channels silent when playing empty project", async ({ page }) => {
    await page.getByTestId("play-pause-button").click();
    await page.waitForTimeout(500);

    expect(await isChannelPlaying(page, "midi")).toBe(false);
    expect(await isChannelPlaying(page, "audio")).toBe(false);
    expect(await isChannelPlaying(page, "metronome")).toBe(false);
  });

  test("metronome produces audio when enabled", async ({ page }) => {
    await page.getByTestId("metronome-toggle").click();
    await page.getByTestId("play-pause-button").click();

    await expect
      .poll(() => isChannelPlaying(page, "metronome"), { timeout: 3000 })
      .toBe(true);
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

    await expect
      .poll(() => isChannelPlaying(page, "midi"), { timeout: 2000 })
      .toBe(true);
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

    await expect
      .poll(() => isChannelPlaying(page, "audio"), { timeout: 2000 })
      .toBe(true);
  });
});
