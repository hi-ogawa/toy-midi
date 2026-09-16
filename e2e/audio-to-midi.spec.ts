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

  test("cancel then close preserves notes and allows another conversion", async ({
    page,
  }) => {
    // Hold model loading so cancellation happens during an active conversion.
    const modelGate = Promise.withResolvers<void>();
    let modelRequests = 0;
    await page.route("**/bass_pitch_bg.wasm", async (route) => {
      modelRequests += 1;
      await modelGate.promise;
      await route.continue();
    });

    // Load audio and retain an existing note until conversion succeeds.
    await page.goto("/");
    await clickNewProject(page);
    await loadAudioFile(page, "test-tones.wav", "test-tones.wav");
    await evaluateStore(page, (store) => {
      store.getState().addNote({
        id: "existing-note",
        pitch: 48,
        start: 0,
        duration: 1,
        velocity: 100,
      });
    });
    const originalNotes = await getNotes(page);
    await page.getByTestId("settings-button").click();
    await page.getByTestId("audio-to-midi-button").click();
    const panel = page.getByTestId("audio-to-midi-panel");
    await expect.poll(() => modelRequests).toBe(1);
    await panel.getByTestId("convert-button").click();
    await expect(
      panel.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeVisible();

    // Cancel the first conversion and preserve the existing notes without an error toast.
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      panel.getByTestId("audio-to-midi-conversion-status"),
    ).toHaveText("Conversion cancelled");
    await expect(panel.getByTestId("convert-button")).toBeEnabled();
    expect(await getNotes(page)).toEqual(originalNotes);
    await expect(
      page.getByText("Failed to convert audio to MIDI", { exact: true }),
    ).toBeHidden();

    // Start another conversion, then close the panel while its fresh worker loads the model.
    await panel.getByTestId("convert-button").click();
    await expect.poll(() => modelRequests).toBe(2);
    await expect(
      panel.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeVisible();
    await panel.getByRole("button", { name: "Close Audio to MIDI" }).click();
    await expect(panel).toBeHidden();
    expect(await getNotes(page)).toEqual(originalNotes);
    await expect(
      page.getByText("Failed to convert audio to MIDI", { exact: true }),
    ).toBeHidden();

    // Release model loading, reopen the panel, and complete a third conversion.
    modelGate.resolve();
    await page.getByTestId("settings-button").click();
    await page.getByTestId("audio-to-midi-button").click();
    await panel.getByTestId("convert-button").click();
    await expect(
      panel.getByTestId("audio-to-midi-conversion-status"),
    ).toHaveText(/^Created \d+ notes in /);
    expect((await getNotes(page)).map((note) => note.pitch)).toContain(60);

    // Undo the successful retry and recover the notes preserved by cancellation.
    await page.keyboard.press("Control+z");
    expect(await getNotes(page)).toEqual(originalNotes);
  });

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
