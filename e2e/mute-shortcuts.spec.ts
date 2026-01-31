import path from "path";
import { expect, test } from "@playwright/test";
import { clickContinue, clickNewProject } from "./helpers";

test.describe("Track Mute Shortcuts", () => {
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

  // Helper to get mute state from store
  async function getMuteState(page: import("@playwright/test").Page) {
    return await page.evaluate(() => {
      const store = (window as Window & { __store: { getState: () => unknown } })
        .__store;
      const state = store.getState() as {
        midiMuted: boolean;
        audioMuted: boolean;
      };
      return {
        midiMuted: state.midiMuted,
        audioMuted: state.audioMuted,
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

  test("mute shortcuts work without audio loaded", async ({ page }) => {
    // Should be able to toggle mutes even without audio loaded
    await page.keyboard.press("Shift+1");
    let muteState = await getMuteState(page);
    expect(muteState.midiMuted).toBe(true);

    await page.keyboard.press("Shift+2");
    muteState = await getMuteState(page);
    expect(muteState.audioMuted).toBe(true);

    // Unmute both
    await page.keyboard.press("Shift+1");
    await page.keyboard.press("Shift+2");
    muteState = await getMuteState(page);
    expect(muteState.midiMuted).toBe(false);
    expect(muteState.audioMuted).toBe(false);
  });

  test("mute state persists after reload", async ({ page }) => {
    // Mute both tracks
    await page.keyboard.press("Shift+1");
    await page.keyboard.press("Shift+2");

    let muteState = await getMuteState(page);
    expect(muteState.midiMuted).toBe(true);
    expect(muteState.audioMuted).toBe(true);

    // Wait for auto-save
    await page.waitForTimeout(100);

    // Reload page
    await page.reload();

    // Click Continue to restore the project
    await clickContinue(page);

    // Mute state should be restored
    muteState = await getMuteState(page);
    expect(muteState.midiMuted).toBe(true);
    expect(muteState.audioMuted).toBe(true);
  });

  test("mute shortcuts don't trigger in text input", async ({ page }) => {
    // Open settings dropdown where there's a textarea
    await page.getByTestId("settings-button").click();

    // Find the project settings button and click to open dialog
    const projectSettingsButton = page.getByTestId("project-settings-button");
    await projectSettingsButton.click();

    // Find the project name input (a text field)
    const projectNameInput = page.getByTestId("project-name-input");
    await projectNameInput.click();
    await projectNameInput.fill("");

    // Get initial mute state
    let muteState = await getMuteState(page);
    const initialMidiMuted = muteState.midiMuted;
    const initialAudioMuted = muteState.audioMuted;

    // Type text that includes Shift+1 and Shift+2 characters
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
