import { expect, type Page, test } from "@playwright/test";
import {
  clickNewProject,
  evaluateFlushAutoSave,
  evaluateStore,
  loadAudioFile,
  waitForEditor,
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
    await loadAudioFile(page, "test-audio.wav");
    await loadAudioFile(page, "test-audio-2.wav");

    await evaluateFlushAutoSave(page);
    await page.reload();
    await waitForEditor(page);

    const tracks = await getAudioTracks(page);
    expect(tracks).toHaveLength(2);
    expect(tracks.map((t) => t.fileName)).toEqual([
      "test-audio.wav",
      "test-audio-2.wav",
    ]);
  });

  test("drags linked audio offsets together", async ({ page }) => {
    await loadAudioFile(page, "test-audio.wav");
    await loadAudioFile(page, "test-audio-2.wav");

    async function getOffsets(page: Page) {
      return await evaluateStore(page, (store) =>
        store.getState().audioTracks.map((t) => t.offset),
      );
    }

    async function dragRegionBy(page: Page, index: number, dx: number) {
      const region = page.getByTestId("audio-track-region").nth(index);
      const box = (await region.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2 + dx,
        box.y + box.height / 2,
        { steps: 5 },
      );
      await page.mouse.up();
    }

    // Default 80 px/beat at 120 BPM: 160 px = 2 beats = 1 s.
    // Linked (default on): dragging one region moves both tracks.
    await dragRegionBy(page, 0, 160);
    let offsets = await getOffsets(page);
    expect(offsets[0]).toBeCloseTo(1, 5);
    expect(offsets[1]).toBeCloseTo(1, 5);

    // Disable linking in Settings, then only the dragged track moves.
    await page.getByTestId("settings-button").click();
    await page.getByRole("checkbox", { name: "Link audio offsets" }).uncheck();
    // Escape is swallowed while the checkbox has focus, so use the close button
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("settings-dialog")).toBeHidden();

    await dragRegionBy(page, 1, 80);
    offsets = await getOffsets(page);
    expect(offsets[0]).toBeCloseTo(1, 5);
    expect(offsets[1]).toBeCloseTo(1.5, 5);
  });

  test("imports ordered audio tracks from a stem ZIP", async ({ page }) => {
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
    await waitForEditor(page);

    tracks = await getAudioTracks(page);
    expect(tracks.map((track) => track.fileName)).toEqual([
      "no_bass.wav",
      "bass.wav",
    ]);
  });

  test("renders a failed audio restore as a dead region", async ({ page }) => {
    await loadAudioFile(page, "test-audio.wav");

    // Force the error state directly; a real decode failure is not
    // reproducible deterministically in e2e
    await evaluateStore(page, (store) => {
      const track = store.getState().audioTracks[0];
      store.getState().updateAudioTrack(track.id, {
        audioWaveform: { status: "error" },
      });
    });

    await expect(page.getByTestId("audio-track-region")).toHaveAttribute(
      "title",
      "Audio failed to load",
    );
  });
});
