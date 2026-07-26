import { expect, type Page, test } from "@playwright/test";
import { clickNewProject, evaluateStore, loadAudioFile } from "./helpers";

test.describe("Audio to MIDI", () => {
  async function getNoteIds(page: Page) {
    return await evaluateStore(page, (store) =>
      store.getState().notes.map((n) => n.id),
    );
  }

  async function getNotePitches(page: Page) {
    return await evaluateStore(page, (store) =>
      [...store.getState().notes]
        .sort((a, b) => a.start - b.start)
        .map((n) => n.pitch),
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
    // are untouched until an explicit convert. Inference takes ~4s solo and
    // longer under parallel suite load. CI fakes this client boundary because
    // GitHub runners cannot execute the real browser model reliably; the Node
    // CLI remains the real-model verification path.
    await panel.getByTestId("analyze-button").click();
    await expect(panel.getByTestId("audio-to-midi-status")).toHaveText(
      "Analyzed",
      { timeout: 10_000 },
    );
    expect(await getNoteIds(page)).toEqual(["note-marker"]);

    // Step 2: convert commits the result, replacing all notes. The fixture
    // is a C4/E4/G4/C5 arpeggio (see e2e/fixtures/README.md) that Basic
    // Pitch transcribes cleanly to exactly those four notes
    await panel.getByTestId("convert-button").click();
    await expect(panel.getByTestId("audio-to-midi-status")).toHaveText(
      "Converted 4 notes",
    );
    expect(await getNotePitches(page)).toEqual([60, 64, 67, 72]);
    const idsAfterFirstConvert = await getNoteIds(page);

    // Staged parameter edits apply on the next convert: narrowing the pitch
    // range to exclude the C5 must drop it from the result
    await panel.getByLabel("Maximum pitch (MIDI)").fill("71");
    await panel.getByTestId("convert-button").click();
    await expect(panel.getByTestId("audio-to-midi-status")).toHaveText(
      "Converted 3 notes",
    );
    expect(await getNotePitches(page)).toEqual([60, 64, 67]);
    const idsAfterSecondConvert = await getNoteIds(page);

    await panel.getByRole("button", { name: "Close" }).click();
    await expect(panel).toBeHidden();

    // Each convert is one history entry: the first undo restores the first
    // convert's notes, the second restores the pre-convert marker
    await page.keyboard.press("Control+z");
    expect(await getNoteIds(page)).toEqual(idsAfterFirstConvert);
    await page.keyboard.press("Control+z");
    expect(await getNoteIds(page)).toEqual(["note-marker"]);

    // Redo re-applies both converts
    await page.keyboard.press("Control+Shift+z");
    await page.keyboard.press("Control+Shift+z");
    expect(await getNoteIds(page)).toEqual(idsAfterSecondConvert);
  });
});
