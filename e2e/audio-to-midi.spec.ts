import { expect, type Page, test } from "@playwright/test";
import { clickNewProject, evaluateStore, loadAudioFile } from "./helpers";

test.describe("Audio to MIDI", () => {
  async function getNoteIds(page: Page) {
    return await evaluateStore(page, (store) =>
      store.getState().notes.map((n) => n.id),
    );
  }

  async function getNotes(page: Page) {
    return await evaluateStore(page, (store) =>
      [...store.getState().notes]
        .sort((a, b) => a.start - b.start)
        .map(({ pitch, start, duration }) => ({ pitch, start, duration })),
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
    // Conversion params are editable before analysis; only Convert is gated
    // on an analyzed track
    await expect(panel.getByTestId("convert-button")).toBeDisabled();
    const quantizeCheckbox = panel.getByRole("checkbox", {
      name: "Quantize to current grid (1/8)",
    });
    // Quantize defaults to on; uncheck it to observe the raw transcription
    // first, then re-check later to cover the quantized path
    await expect(quantizeCheckbox).toBeChecked();
    await quantizeCheckbox.uncheck();

    // Step 1: analyze runs inference and caches activations; project notes
    // are untouched until an explicit convert. Inference takes ~4s solo and
    // longer under parallel suite load. CI fakes this client boundary because
    // GitHub runners cannot execute the real browser model reliably; the Node
    // CLI remains the real-model verification path.
    await panel.getByTestId("analyze-button").click();
    await expect(panel.getByTestId("audio-to-midi-analysis-status")).toHaveText(
      /^Analyzed in (\d+ms|\d+\.\d+s)$/,
      { timeout: 10_000 },
    );
    await expect(panel.getByTestId("convert-button")).toBeEnabled();
    expect(await getNoteIds(page)).toEqual(["note-marker"]);

    // Step 2: convert commits the result, replacing all notes. The fixture
    // is a C4/E4/G4/C5 arpeggio (see e2e/fixtures/README.md) that Basic
    // Pitch transcribes cleanly to exactly those four notes
    await panel.getByTestId("convert-button").click();
    await expect(
      panel.getByTestId("audio-to-midi-conversion-status"),
    ).toHaveText(/^Created 4 notes in (\d+ms|\d+\.\d+s)$/);
    expect((await getNotes(page)).map((note) => note.pitch)).toEqual([
      60, 64, 67, 72,
    ]);
    const idsAfterFirstConvert = await getNoteIds(page);

    // Staged parameter edits apply on the next convert: narrowing the pitch
    // range to exclude the C5 must drop it from the result.
    const maxPitchThumb = panel.getByRole("slider").last();
    await maxPitchThumb.evaluate((thumb) =>
      thumb
        .closest('[data-slot="slider"]')
        ?.dispatchEvent(
          new CustomEvent("slider:set-value", { detail: [21, 71] }),
        ),
    );
    await expect(maxPitchThumb).toHaveAttribute("aria-valuenow", "71");
    await panel.getByTestId("convert-button").click();
    await expect(
      panel.getByTestId("audio-to-midi-conversion-status"),
    ).toHaveText(/^Created 3 notes in (\d+ms|\d+\.\d+s)$/);
    expect((await getNotes(page)).map((note) => note.pitch)).toEqual([
      60, 64, 67,
    ]);
    const idsAfterSecondConvert = await getNoteIds(page);

    // Optional quantization follows the current grid and remains part of the
    // conversion's single replace-all history entry.
    await quantizeCheckbox.check();
    await panel.getByTestId("convert-button").click();
    await expect(
      panel.getByTestId("audio-to-midi-conversion-status"),
    ).toHaveText(/^Created 3 notes in (\d+ms|\d+\.\d+s)$/);
    for (const { start, duration } of await getNotes(page)) {
      expect(start * 2).toBe(Math.round(start * 2));
      expect(duration * 2).toBe(Math.round(duration * 2));
      expect(duration).toBeGreaterThanOrEqual(0.5);
    }
    const idsAfterQuantizedConvert = await getNoteIds(page);

    await panel.getByRole("button", { name: "Close Audio to MIDI" }).click();
    await expect(panel).toBeHidden();

    // Each convert is one history entry. Undo restores each prior conversion,
    // then the pre-convert marker.
    await page.keyboard.press("Control+z");
    expect(await getNoteIds(page)).toEqual(idsAfterSecondConvert);
    await page.keyboard.press("Control+z");
    expect(await getNoteIds(page)).toEqual(idsAfterFirstConvert);
    await page.keyboard.press("Control+z");
    expect(await getNoteIds(page)).toEqual(["note-marker"]);

    // Redo re-applies both converts
    await page.keyboard.press("Control+Shift+z");
    await page.keyboard.press("Control+Shift+z");
    await page.keyboard.press("Control+Shift+z");
    expect(await getNoteIds(page)).toEqual(idsAfterQuantizedConvert);
  });
});
