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

    // Analyze runs inference; the initial decode then replaces notes live.
    // Done once the replace lands in the store: the marker note disappears
    // regardless of what the model detected
    await panel.getByTestId("analyze-button").click();
    await expect
      .poll(async () => (await getNoteIds(page)).includes("note-marker"))
      .toBe(false);
    const idsAfterTranscribe = await getNoteIds(page);

    await panel.getByRole("button", { name: "Close" }).click();
    await expect(panel).toBeHidden();

    // One undo restores the entire pre-transcription state (live re-decodes
    // within a panel session coalesce into a single history entry)
    await page.keyboard.press("Control+z");
    expect(await getNoteIds(page)).toEqual(["note-marker"]);

    // Redo re-applies the transcription result
    await page.keyboard.press("Control+Shift+z");
    expect(await getNoteIds(page)).toEqual(idsAfterTranscribe);
  });
});
