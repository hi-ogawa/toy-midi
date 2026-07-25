import { expect, type Page, test } from "@playwright/test";
import { clickNewProject, evaluateStore, loadAudioFile } from "./helpers";

test.describe("Audio to MIDI", () => {
  async function getNoteIds(page: Page) {
    return await evaluateStore(page, (store) =>
      store.getState().notes.map((n) => n.id),
    );
  }

  test("transcribes an audio track and replaces notes as one undo step", async ({
    page,
  }) => {
    await page.goto("/");
    await clickNewProject(page);
    await loadAudioFile(page, "test-tones.wav", "test-tones.wav");

    // Seed a marker note to observe the replace-all and undo semantics
    await evaluateStore(page, (store) => {
      store.getState().addNote({
        id: "note-marker",
        pitch: 100,
        start: 0,
        duration: 1,
        velocity: 100,
      });
    });

    // Open the transcription panel from the track row in Settings; the
    // settings dialog closes so the panel and piano roll are usable together
    await page.getByTestId("settings-button").click();
    await page.getByTestId("audio-to-midi-button").click();
    await expect(page.getByTestId("settings-dialog")).toBeHidden();
    const panel = page.getByTestId("audio-to-midi-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("audio-to-midi-file-name")).toHaveText(
      "test-tones.wav",
    );

    // Step 1: analyze runs inference and caches activations; project notes
    // are untouched until an explicit convert
    await panel.getByTestId("analyze-button").click();
    await expect(panel.getByTestId("audio-to-midi-status")).toHaveText(
      "Analyzed",
    );
    expect(await getNoteIds(page)).toEqual(["note-marker"]);

    // Step 2: convert commits the result, replacing all notes
    await panel.getByTestId("convert-button").click();
    await expect(panel.getByTestId("audio-to-midi-status")).toHaveText(
      /^Converted \d+ notes$/,
    );
    expect(await getNoteIds(page)).not.toContain("note-marker");
    const idsAfterTranscribe = await getNoteIds(page);

    await panel.getByRole("button", { name: "Close" }).click();
    await expect(panel).toBeHidden();

    // Each convert is one history entry, so one undo restores the
    // prior state
    await page.keyboard.press("Control+z");
    expect(await getNoteIds(page)).toEqual(["note-marker"]);

    // Redo re-applies the transcription result
    await page.keyboard.press("Control+Shift+z");
    expect(await getNoteIds(page)).toEqual(idsAfterTranscribe);
  });
});
