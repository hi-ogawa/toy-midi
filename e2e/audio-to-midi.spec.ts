import { expect, type Page, test } from "@playwright/test";
import { clickNewProject, evaluateStore, loadAudioFile } from "./helpers";

test.describe("Audio to MIDI", () => {
  async function getNotes(page: Page) {
    return await evaluateStore(page, (store) =>
      [...store.getState().notes]
        .sort((a, b) => a.start - b.start)
        .map(({ pitch, start, duration }) => ({ pitch, start, duration })),
    );
  }

  test("converts in one step and stays grid-aligned", async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
    await loadAudioFile(page, "test-tones.wav", "test-tones.wav");
    await page.getByTestId("settings-button").click();
    await page.getByTestId("audio-to-midi-button").click();
    const panel = page.getByTestId("audio-to-midi-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("audio-to-midi-file-name")).toHaveText(
      "test-tones.wav",
    );

    // Run audio to midi
    await panel.getByTestId("convert-button").click();
    await expect(
      panel.getByTestId("audio-to-midi-conversion-status"),
    ).toHaveText(/^Created \d+ notes in (\d+ms|\d+\.\d+s)$/);

    // Verify generated midi notes
    const notes = await getNotes(page);
    for (const pitch of [60, 64, 67]) {
      expect(notes.map((note) => note.pitch)).toContain(pitch);
    }
    for (const { start, duration } of notes) {
      expect(start * 2).toBe(Math.round(start * 2));
      expect(duration * 2).toBe(Math.round(duration * 2));
    }

    // One conversion is a single undo entry
    await page.keyboard.press("Control+z");
    expect(await getNotes(page)).toEqual([]);
  });
});
