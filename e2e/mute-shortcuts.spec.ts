import { expect, type Page, test } from "@playwright/test";
import {
  waitForEditor,
  clickNewProject,
  evaluateFlushAutoSave,
  evaluateStore,
  loadAudioFile,
} from "./helpers";

test.describe("Track Mute Shortcuts", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  // Helper to get mute state from store.
  // Audio mute now lives per-track; Shift+2 toggles the first audio track.
  async function getMuteState(page: Page) {
    return await evaluateStore(page, (store) => {
      const state = store.getState();
      return {
        midiMuted: state.midiMuted,
        audioMuted: state.audioTracks[0]?.muted ?? false,
      };
    });
  }

  test("Shift+1 toggles MIDI mute", async ({ page }) => {
    // Initial state - MIDI not muted
    let muteState = await getMuteState(page);
    expect(muteState.midiMuted).toBe(false);

    // Press Shift+1 to mute
    await page.keyboard.press("Shift+1");
    muteState = await getMuteState(page);
    expect(muteState.midiMuted).toBe(true);

    // Press Shift+1 again to unmute
    await page.keyboard.press("Shift+1");
    muteState = await getMuteState(page);
    expect(muteState.midiMuted).toBe(false);
  });

  test("Shift+2 toggles audio mute", async ({ page }) => {
    // Load audio first
    await loadAudioFile(page);

    // Initial state - audio not muted
    let muteState = await getMuteState(page);
    expect(muteState.audioMuted).toBe(false);

    // Press Shift+2 to mute
    await page.keyboard.press("Shift+2");
    muteState = await getMuteState(page);
    expect(muteState.audioMuted).toBe(true);

    // Press Shift+2 again to unmute
    await page.keyboard.press("Shift+2");
    muteState = await getMuteState(page);
    expect(muteState.audioMuted).toBe(false);
  });

  test("MIDI mute shortcut works without audio loaded", async ({ page }) => {
    // MIDI mute works regardless of audio; audio mute is a no-op with no track
    await page.keyboard.press("Shift+1");
    let muteState = await getMuteState(page);
    expect(muteState.midiMuted).toBe(true);

    // Shift+2 has no audio track to act on - stays unmuted
    await page.keyboard.press("Shift+2");
    muteState = await getMuteState(page);
    expect(muteState.audioMuted).toBe(false);

    // Unmute MIDI
    await page.keyboard.press("Shift+1");
    muteState = await getMuteState(page);
    expect(muteState.midiMuted).toBe(false);
  });

  test("mute state persists after reload", async ({ page }) => {
    // Audio mute is per-track, so load audio before muting it
    await loadAudioFile(page);

    // Mute both tracks
    await page.keyboard.press("Shift+1");
    await page.keyboard.press("Shift+2");

    let muteState = await getMuteState(page);
    expect(muteState.midiMuted).toBe(true);
    expect(muteState.audioMuted).toBe(true);

    await evaluateFlushAutoSave(page);

    // Reload page
    await page.reload();

    await waitForEditor(page);

    // Mute state should be restored
    muteState = await getMuteState(page);
    expect(muteState.midiMuted).toBe(true);
    expect(muteState.audioMuted).toBe(true);
  });

  test("mute shortcuts don't trigger in text input", async ({ page }) => {
    // Open settings dialog
    await page.getByTestId("settings-button").click();
    const settingsDialog = page.getByTestId("settings-dialog");

    // Find the project name input (a text field in the Settings dialog)
    const projectNameInput = settingsDialog.locator("#settings-project-name");

    // Get initial mute state
    let muteState = await getMuteState(page);
    const initialMidiMuted = muteState.midiMuted;
    const initialAudioMuted = muteState.audioMuted;

    // Click and select all, then type text that includes Shift+1 and Shift+2 characters
    await projectNameInput.click();
    await page.keyboard.press("Control+A");
    await projectNameInput.type("Test!@");

    // Should have typed the text
    await expect(projectNameInput).toHaveValue("Test!@");

    // Mute state should NOT have changed (shortcuts ignored in input)
    muteState = await getMuteState(page);
    expect(muteState.midiMuted).toBe(initialMidiMuted);
    expect(muteState.audioMuted).toBe(initialAudioMuted);
  });

  test("both tracks can be muted independently", async ({ page }) => {
    await loadAudioFile(page);

    // Mute MIDI only
    await page.keyboard.press("Shift+1");
    let muteState = await getMuteState(page);
    expect(muteState.midiMuted).toBe(true);
    expect(muteState.audioMuted).toBe(false);

    // Mute audio only (MIDI still muted)
    await page.keyboard.press("Shift+2");
    muteState = await getMuteState(page);
    expect(muteState.midiMuted).toBe(true);
    expect(muteState.audioMuted).toBe(true);

    // Unmute MIDI (audio still muted)
    await page.keyboard.press("Shift+1");
    muteState = await getMuteState(page);
    expect(muteState.midiMuted).toBe(false);
    expect(muteState.audioMuted).toBe(true);

    // Unmute audio (both unmuted)
    await page.keyboard.press("Shift+2");
    muteState = await getMuteState(page);
    expect(muteState.midiMuted).toBe(false);
    expect(muteState.audioMuted).toBe(false);
  });
});
