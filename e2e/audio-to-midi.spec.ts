import { expect, test } from "@playwright/test";
import { clickNewProject, evaluateStore, loadAudioFile } from "./helpers";

test.describe("Audio to MIDI", () => {
  test("transcribes an audio track and replaces notes as one undo step", async ({
    page,
  }) => {
    await page.goto("/");
    await clickNewProject(page);
    await loadAudioFile(page, "bass.wav");

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

    // Open the transcription modal from the track row in Settings
    await page.getByTestId("settings-button").click();
    await page.getByTestId("audio-to-midi-button").click();
    const modal = page.getByTestId("audio-to-midi-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("bass.wav")).toBeVisible();

    // Real model inference runs in a worker; allow a generous timeout
    await modal.getByTestId("transcribe-button").click();
    await expect(
      page.getByText(/Replaced notes with \d+ transcribed notes/),
    ).toBeVisible({ timeout: 30_000 });

    // The marker note is gone regardless of what the model detected
    const idsAfterTranscribe = await evaluateStore(page, (store) =>
      store.getState().notes.map((n) => n.id),
    );
    expect(idsAfterTranscribe).not.toContain("note-marker");

    // Close the modal, then Settings
    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).toBeHidden();
    await page.keyboard.press("Escape");

    // One undo restores the entire pre-transcription state
    await page.keyboard.press("Control+z");
    const idsAfterUndo = await evaluateStore(page, (store) =>
      store.getState().notes.map((n) => n.id),
    );
    expect(idsAfterUndo).toEqual(["note-marker"]);

    // Redo re-applies the transcription result
    await page.keyboard.press("Control+Shift+z");
    const idsAfterRedo = await evaluateStore(page, (store) =>
      store.getState().notes.map((n) => n.id),
    );
    expect(idsAfterRedo).toEqual(idsAfterTranscribe);
  });
});
