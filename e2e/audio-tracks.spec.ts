import { expect, type Page, test } from "@playwright/test";
import {
  clickContinue,
  clickNewProject,
  evaluateFlushAutoSave,
  evaluateStore,
  loadAudioFile,
} from "./helpers";

test.describe("Multiple Audio Tracks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  // Read audio tracks from the store
  async function getAudioTracks(page: Page) {
    return await evaluateStore(page, (store) => {
      const state = store.getState();
      return state.audioTracks.map((t) => ({
        id: t.id,
        fileName: t.fileName,
        muted: t.muted,
      }));
    });
  }

  test("supports multiple audio tracks", async ({ page }) => {
    await loadAudioFile(page, "test-audio.wav");
    await loadAudioFile(page, "test-audio-2.wav");
    await loadAudioFile(page, "test-audio.wav");

    let tracks = await getAudioTracks(page);
    expect(tracks).toHaveLength(3);
    expect(tracks[0].fileName).toBe("test-audio.wav");
    expect(tracks[1].fileName).toBe("test-audio-2.wav");
    expect(tracks[2].fileName).toBe("test-audio.wav");
    await expect(page.getByTestId("audio-track-region")).toHaveCount(3);

    // Loading remains available after more than two tracks.
    await page.getByTestId("settings-button").click();
    const loadButton = page.getByTestId("load-audio-button");
    await expect(loadButton).toBeEnabled();
    await page.keyboard.press("Escape");

    // Mute the first track via the piano-roll lane toggle
    const muteToggles = page.getByRole("button", {
      name: "Toggle audio mute",
    });
    await expect(muteToggles).toHaveCount(3);
    await muteToggles.first().click();

    tracks = await getAudioTracks(page);
    expect(tracks[0].muted).toBe(true);
    expect(tracks[1].muted).toBe(false);
    expect(tracks[2].muted).toBe(false);

    // Remove the first track from Settings
    await page.getByTestId("settings-button").click();
    await page.getByTestId("remove-audio-button").first().click();
    await page.keyboard.press("Escape");

    // Removal is async (awaits asset deletion); wait for the UI first
    await expect(page.getByTestId("audio-track-region")).toHaveCount(2);

    tracks = await getAudioTracks(page);
    expect(tracks).toHaveLength(2);
    expect(tracks[0].fileName).toBe("test-audio-2.wav");
    expect(tracks[1].fileName).toBe("test-audio.wav");
  });

  test("two tracks persist across reload", async ({ page }) => {
    // Loads two audio files then reloads - allow extra time
    test.slow();
    await loadAudioFile(page, "test-audio.wav");
    await loadAudioFile(page, "test-audio-2.wav");

    // Wait for auto-save
    await page.waitForTimeout(200);
    await page.reload();
    await page.getByTestId("continue-button").click();
    await page.getByTestId("transport").waitFor({ state: "visible" });

    const tracks = await getAudioTracks(page);
    expect(tracks).toHaveLength(2);
    expect(tracks.map((t) => t.fileName)).toEqual([
      "test-audio.wav",
      "test-audio-2.wav",
    ]);
  });

  test("imports ordered audio tracks from a stem ZIP", async ({ page }) => {
    test.slow();
    await page.getByTestId("settings-button").click();
    await page
      .getByTestId("audio-file-input")
      .setInputFiles("e2e/fixtures/test-stems.zip");
    await expect(page.getByTestId("remove-audio-button")).toHaveCount(2);
    await page.keyboard.press("Escape");

    let tracks = await getAudioTracks(page);
    expect(tracks.map((track) => track.fileName)).toEqual([
      "no_bass.wav",
      "bass.wav",
    ]);
    await expect(page.getByTestId("audio-track-region")).toHaveCount(2);

    await evaluateFlushAutoSave(page);
    await page.reload();
    await clickContinue(page);

    tracks = await getAudioTracks(page);
    expect(tracks.map((track) => track.fileName)).toEqual([
      "no_bass.wav",
      "bass.wav",
    ]);
  });
});
