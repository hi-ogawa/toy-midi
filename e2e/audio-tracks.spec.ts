import { expect, test } from "@playwright/test";
import { clickNewProject, loadAudioFile } from "./helpers";

test.describe("Multiple Audio Tracks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  // Read audio tracks from the store
  async function getAudioTracks(page: import("@playwright/test").Page) {
    return await page.evaluate(() => {
      const store = (
        window as Window & { __store: { getState: () => unknown } }
      ).__store;
      const state = store.getState() as {
        audioTracks: Array<{ id: string; fileName: string; muted: boolean }>;
      };
      return state.audioTracks.map((t) => ({
        id: t.id,
        fileName: t.fileName,
        muted: t.muted,
      }));
    });
  }

  test("load two audio tracks and render two lanes", async ({ page }) => {
    await loadAudioFile(page, "test-audio.wav");
    await loadAudioFile(page, "test-audio-2.wav");

    const tracks = await getAudioTracks(page);
    expect(tracks).toHaveLength(2);
    expect(tracks[0].fileName).toBe("test-audio.wav");
    expect(tracks[1].fileName).toBe("test-audio-2.wav");

    // Two waveform regions visible
    const regions = page.locator(".bg-emerald-700, .bg-emerald-600");
    await expect(regions).toHaveCount(2);
  });

  test("third track cannot be added (max 2)", async ({ page }) => {
    await loadAudioFile(page, "test-audio.wav");
    await loadAudioFile(page, "test-audio-2.wav");

    // Load button is disabled once at the limit
    await page.getByTestId("settings-button").click();
    const loadButton = page.getByTestId("load-audio-button");
    await expect(loadButton).toBeDisabled();
    await page.keyboard.press("Escape");

    const tracks = await getAudioTracks(page);
    expect(tracks).toHaveLength(2);
  });

  test("tracks can be muted independently", async ({ page }) => {
    await loadAudioFile(page, "test-audio.wav");
    await loadAudioFile(page, "test-audio-2.wav");

    // Mute the first track via the piano-roll lane toggle
    const muteToggles = page.getByRole("button", {
      name: "Toggle audio mute",
    });
    await expect(muteToggles).toHaveCount(2);
    await muteToggles.first().click();

    const tracks = await getAudioTracks(page);
    expect(tracks[0].muted).toBe(true);
    expect(tracks[1].muted).toBe(false);
  });

  test("remove one track leaves the other", async ({ page }) => {
    await loadAudioFile(page, "test-audio.wav");
    await loadAudioFile(page, "test-audio-2.wav");

    // Remove the first track from Settings
    await page.getByTestId("settings-button").click();
    await page.getByTestId("remove-audio-button").first().click();
    await page.keyboard.press("Escape");

    const tracks = await getAudioTracks(page);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].fileName).toBe("test-audio-2.wav");

    const regions = page.locator(".bg-emerald-700, .bg-emerald-600");
    await expect(regions).toHaveCount(1);
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
});
