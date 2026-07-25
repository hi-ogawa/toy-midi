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
    await expect(modal.getByTestId("audio-to-midi-file-name")).toHaveText(
      "bass.wav",
    );

    // Transcription is done once the replace has landed in the store; the
    // marker note disappears regardless of what the model detected
    await modal.getByTestId("transcribe-button").click();
    await expect
      .poll(async () => (await getNoteIds(page)).includes("note-marker"))
      .toBe(false);
    const idsAfterTranscribe = await getNoteIds(page);

    // Close the modal, then Settings
    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).toBeHidden();
    await page.keyboard.press("Escape");

    // One undo restores the entire pre-transcription state
    await page.keyboard.press("Control+z");
    expect(await getNoteIds(page)).toEqual(["note-marker"]);

    // Redo re-applies the transcription result
    await page.keyboard.press("Control+Shift+z");
    expect(await getNoteIds(page)).toEqual(idsAfterTranscribe);
  });

  // TODO: add a fixture with clearly pitched content Basic Pitch can detect,
  // generated like test-stems.zip (see e2e/fixtures/README.md), e.g. C2, E2,
  // G2 (MIDI 36/40/43) synthesized for one beat each at 120 BPM.
  // Verified with `pnpm verify-basic-pitch` (Node, same model): such tones
  // transcribe to the expected pitches, and the existing public/test-audio.wav
  // is a 3s A4 tone that already comes back as a single midi-69 note.
  test.skip("detects known pitches from a synthesized fixture", async () => {
    // Ideal assertion: after transcribing that fixture, store notes are
    // [{ pitch: 36, start: ≈0 }, { pitch: 40, start: ≈1 }, { pitch: 43, start: ≈2 }]
    // with starts/durations within a small tolerance, so decoder regressions
    // (thresholds, timing alignment, seconds→beats conversion) are caught.
  });
});
