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

    // Open the transcription panel from the track row in Settings; the
    // settings dialog closes so the panel and piano roll are usable together
    await page.getByTestId("settings-button").click();
    await page.getByTestId("audio-to-midi-button").click();
    await expect(page.getByTestId("settings-dialog")).toBeHidden();
    const panel = page.getByTestId("audio-to-midi-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("audio-to-midi-file-name")).toHaveText(
      "bass.wav",
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
