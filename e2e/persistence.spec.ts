import { expect, test } from "@playwright/test";
import { clickContinue, clickNewProject, evaluateStore } from "./helpers";

test.describe("Project Persistence", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Clear localStorage to start fresh
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Click through startup screen (no saved project, so "New Project")
    await clickNewProject(page);
  });

  test("notes persist after page reload", async ({ page }) => {
    // Add a note via store
    await evaluateStore(page, (store) => {
      store
        .getState()
        .addNote({ id: "n1", pitch: 60, start: 1, duration: 2, velocity: 100 });
    });

    // Verify note exists in store
    const noteCount = await evaluateStore(
      page,
      (store) => store.getState().notes.length,
    );
    expect(noteCount).toBe(1);

    // Wait for auto-save (debounced at 500ms)
    await page.waitForTimeout(600);

    // Reload the page and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // Note should still exist after reload (verify via store)
    const restoredNotes = await evaluateStore(
      page,
      (store) => store.getState().notes,
    );
    expect(restoredNotes).toHaveLength(1);
    expect(restoredNotes[0].pitch).toBe(60);
    expect(restoredNotes[0].start).toBe(1);
    expect(restoredNotes[0].duration).toBe(2);
  });

  test("multiple notes persist after reload", async ({ page }) => {
    // Add 3 notes via store
    await evaluateStore(page, (store) => {
      store
        .getState()
        .addNote({ id: "n1", pitch: 60, start: 0, duration: 1, velocity: 100 });
      store.getState().addNote({
        id: "n2",
        pitch: 55,
        start: 2,
        duration: 1.5,
        velocity: 100,
      });
      store
        .getState()
        .addNote({ id: "n3", pitch: 50, start: 5, duration: 1, velocity: 100 });
    });

    // Verify 3 notes exist
    const noteCount = await evaluateStore(
      page,
      (store) => store.getState().notes.length,
    );
    expect(noteCount).toBe(3);

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // All 3 notes should be restored (verify via store)
    const restoredNotes = await evaluateStore(
      page,
      (store) => store.getState().notes,
    );
    expect(restoredNotes).toHaveLength(3);
    expect(restoredNotes.map((n) => n.id).sort()).toEqual(["n1", "n2", "n3"]);
  });

  test("audio file persists after reload", async ({ page }) => {
    // Load audio file
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByTestId("load-audio-button").click(),
    ]);
    await fileChooser.setFiles("public/test-audio.wav");

    // Wait for audio to load
    await expect(page.getByTestId("audio-file-name")).toBeVisible();
    await expect(page.getByTestId("audio-file-name")).toHaveText(
      "test-audio.wav",
    );

    // Get duration before reload
    const timeDisplay = page.getByTestId("time-display");
    await expect(timeDisplay).not.toContainText("0:00 / 0:00");

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // Audio file name should be restored
    await expect(page.getByTestId("audio-file-name")).toBeVisible();
    await expect(page.getByTestId("audio-file-name")).toHaveText(
      "test-audio.wav",
    );

    // Duration should be restored (not 0:00)
    await expect(page.getByTestId("time-display")).not.toContainText(
      "0:00 / 0:00",
    );
  });

  test("tempo persists after reload", async ({ page }) => {
    // Change tempo via UI
    const tempoInput = page.getByTestId("tempo-input");
    await tempoInput.fill("95");
    await tempoInput.blur();

    // Verify via store
    const tempo = await evaluateStore(page, (store) => store.getState().tempo);
    expect(tempo).toBe(95);

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // Tempo should be restored (verify via store)
    const restoredTempo = await evaluateStore(
      page,
      (store) => store.getState().tempo,
    );
    expect(restoredTempo).toBe(95);
  });

  test("grid snap persists after reload", async ({ page }) => {
    // Change grid snap via UI
    const gridSelect = page.locator("select").first();
    await gridSelect.selectOption("1/16");

    // Verify via store
    const gridSnap = await evaluateStore(
      page,
      (store) => store.getState().gridSnap,
    );
    expect(gridSnap).toBe("1/16");

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // Grid snap should be restored (verify via store)
    const restoredGridSnap = await evaluateStore(
      page,
      (store) => store.getState().gridSnap,
    );
    expect(restoredGridSnap).toBe("1/16");
  });

  test("metronome setting persists after reload", async ({ page }) => {
    // Enable metronome via UI
    const metronomeToggle = page.getByTestId("metronome-toggle");
    await metronomeToggle.click();

    // Verify via store
    const metronomeEnabled = await evaluateStore(
      page,
      (store) => store.getState().metronomeEnabled,
    );
    expect(metronomeEnabled).toBe(true);

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // Metronome should still be enabled (verify via store)
    const restoredMetronome = await evaluateStore(
      page,
      (store) => store.getState().metronomeEnabled,
    );
    expect(restoredMetronome).toBe(true);
  });

  test("note edits persist after reload", async ({ page }) => {
    // Create a note via store
    await evaluateStore(page, (store) => {
      store
        .getState()
        .addNote({ id: "n1", pitch: 60, start: 1, duration: 1, velocity: 100 });
    });

    // Edit the note (move it and change pitch) via store
    await evaluateStore(page, (store) => {
      store.getState().updateNote("n1", { pitch: 65, start: 4, duration: 2 });
    });

    // Verify the edit via store
    const editedNote = await evaluateStore(page, (store) =>
      store.getState().notes.find((n) => n.id === "n1"),
    );
    expect(editedNote).toEqual({
      id: "n1",
      pitch: 65,
      start: 4,
      duration: 2,
      velocity: 100,
    });

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // Note should be at the edited position (verify via store)
    const restoredNote = await evaluateStore(page, (store) =>
      store.getState().notes.find((n) => n.id === "n1"),
    );
    expect(restoredNote).toEqual({
      id: "n1",
      pitch: 65,
      start: 4,
      duration: 2,
      velocity: 100,
    });
  });

  test("deleted notes stay deleted after reload", async ({ page }) => {
    // Create two notes via store
    await evaluateStore(page, (store) => {
      store
        .getState()
        .addNote({ id: "n1", pitch: 60, start: 0, duration: 1, velocity: 100 });
      store
        .getState()
        .addNote({ id: "n2", pitch: 55, start: 3, duration: 1, velocity: 100 });
    });

    // Verify 2 notes exist
    let noteCount = await evaluateStore(
      page,
      (store) => store.getState().notes.length,
    );
    expect(noteCount).toBe(2);

    // Delete one note via store
    await evaluateStore(page, (store) => {
      store.getState().deleteNotes(["n2"]);
    });

    // Verify only 1 note remains
    noteCount = await evaluateStore(
      page,
      (store) => store.getState().notes.length,
    );
    expect(noteCount).toBe(1);

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // Should still have only 1 note (verify via store)
    const restoredNotes = await evaluateStore(
      page,
      (store) => store.getState().notes,
    );
    expect(restoredNotes).toHaveLength(1);
    expect(restoredNotes[0].id).toBe("n1");
  });

  test("selection is not persisted (transient state)", async ({ page }) => {
    // Create a note and select it via store
    await evaluateStore(page, (store) => {
      store
        .getState()
        .addNote({ id: "n1", pitch: 60, start: 1, duration: 1, velocity: 100 });
      store.getState().selectNotes(["n1"]);
    });

    // Verify note is selected
    const selectedIds = await evaluateStore(page, (store) =>
      Array.from(store.getState().selectedNoteIds),
    );
    expect(selectedIds).toContain("n1");

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // Note should exist but NOT be selected (selection is transient)
    const restoredNotes = await evaluateStore(
      page,
      (store) => store.getState().notes,
    );
    expect(restoredNotes).toHaveLength(1);

    const restoredSelectedIds = await evaluateStore(page, (store) =>
      Array.from(store.getState().selectedNoteIds),
    );
    expect(restoredSelectedIds).toHaveLength(0);
  });

  test("playhead position resets on reload (transient state)", async ({
    page,
  }) => {
    // Create a note and set playhead position via store
    await evaluateStore(page, (store) => {
      store
        .getState()
        .addNote({ id: "n1", pitch: 60, start: 1, duration: 1, velocity: 100 });
      store.getState().setPlayheadPosition(5.0); // Set to 5 seconds
    });

    // Verify playhead is at 5 seconds
    const playhead = await evaluateStore(
      page,
      (store) => store.getState().playheadPosition,
    );
    expect(playhead).toBe(5.0);

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // Playhead should reset to 0 (verify via store)
    const restoredPlayhead = await evaluateStore(
      page,
      (store) => store.getState().playheadPosition,
    );
    expect(restoredPlayhead).toBe(0);
  });
});
