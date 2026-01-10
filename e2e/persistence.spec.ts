import { expect, test } from "@playwright/test";
import { clickContinue, clickNewProject } from "./helpers";

// Constants matching piano-roll.tsx
const BEAT_WIDTH = 80;
const ROW_HEIGHT = 20;

test.describe("Project Persistence", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Clear localStorage to start fresh
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Click through startup screen (no saved project, so "New Project")
    await clickNewProject(page);
  });

  test("notes persist after reload", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note
    const startX = gridBox.x + BEAT_WIDTH * 1.5;
    const startY = gridBox.y + ROW_HEIGHT * 3.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH * 2, startY);
    await page.mouse.up();

    // Verify note exists
    const note = page.locator("[data-testid^='note-']");
    await expect(note).toHaveCount(1);

    // Wait for auto-save (debounced at 500ms)
    await page.waitForTimeout(600);

    // Reload the page and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // Note should still exist after reload
    const restoredNote = page.locator("[data-testid^='note-']");
    await expect(restoredNote).toHaveCount(1);
  });

  test("multiple notes persist after reload", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create first note
    await page.mouse.move(
      gridBox.x + BEAT_WIDTH * 0.5,
      gridBox.y + ROW_HEIGHT * 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      gridBox.x + BEAT_WIDTH * 1.5,
      gridBox.y + ROW_HEIGHT * 2,
    );
    await page.mouse.up();

    await page.keyboard.press("Escape");

    // Create second note
    await page.mouse.move(
      gridBox.x + BEAT_WIDTH * 2.5,
      gridBox.y + ROW_HEIGHT * 4,
    );
    await page.mouse.down();
    await page.mouse.move(
      gridBox.x + BEAT_WIDTH * 4,
      gridBox.y + ROW_HEIGHT * 4,
    );
    await page.mouse.up();

    await page.keyboard.press("Escape");

    // Create third note
    await page.mouse.move(
      gridBox.x + BEAT_WIDTH * 5,
      gridBox.y + ROW_HEIGHT * 6,
    );
    await page.mouse.down();
    await page.mouse.move(
      gridBox.x + BEAT_WIDTH * 6,
      gridBox.y + ROW_HEIGHT * 6,
    );
    await page.mouse.up();

    // Verify 3 notes exist
    await expect(page.locator("[data-testid^='note-']")).toHaveCount(3);

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // All 3 notes should be restored
    await expect(page.locator("[data-testid^='note-']")).toHaveCount(3);
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

  test("settings persist after reload", async ({ page }) => {
    // Change tempo
    const tempoInput = page.getByTestId("tempo-input");
    await expect(tempoInput).toHaveValue("120");
    await tempoInput.fill("95");
    await tempoInput.blur();
    await expect(tempoInput).toHaveValue("95");

    // Change grid snap
    const gridSelect = page.locator("select").first();
    await expect(gridSelect).toHaveValue("1/8");
    await gridSelect.selectOption("1/16");
    await expect(gridSelect).toHaveValue("1/16");

    // Enable metronome
    const metronomeToggle = page.getByTestId("metronome-toggle");
    await expect(metronomeToggle).toHaveAttribute("aria-pressed", "false");
    await metronomeToggle.click();
    await expect(metronomeToggle).toHaveAttribute("aria-pressed", "true");

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // All settings should be restored
    await expect(page.getByTestId("tempo-input")).toHaveValue("95");
    await expect(page.locator("select").first()).toHaveValue("1/16");
    await expect(page.getByTestId("metronome-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("note edits persist after reload", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note
    const startX = gridBox.x + BEAT_WIDTH * 1;
    const startY = gridBox.y + ROW_HEIGHT * 5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();

    const note = page.locator("[data-testid^='note-']").first();
    const initialBox = await note.boundingBox();
    if (!initialBox) throw new Error("Note not found");

    // Move the note
    const noteCenter = initialBox.x + initialBox.width / 2;
    await page.mouse.move(noteCenter, initialBox.y + initialBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      noteCenter + BEAT_WIDTH * 3,
      initialBox.y - ROW_HEIGHT * 2,
    );
    await page.mouse.up();

    // Get new position
    const movedBox = await note.boundingBox();
    if (!movedBox) throw new Error("Note not found after move");

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // Note should be at the moved position
    const restoredNote = page.locator("[data-testid^='note-']").first();
    const restoredBox = await restoredNote.boundingBox();
    if (!restoredBox) throw new Error("Note not found after reload");

    // Position should match (within tolerance for rounding)
    expect(restoredBox.x).toBeCloseTo(movedBox.x, -1);
    expect(restoredBox.y).toBeCloseTo(movedBox.y, -1);
  });

  test("deleted notes stay deleted after reload", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create two notes
    await page.mouse.move(
      gridBox.x + BEAT_WIDTH * 0.5,
      gridBox.y + ROW_HEIGHT * 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      gridBox.x + BEAT_WIDTH * 1.5,
      gridBox.y + ROW_HEIGHT * 2,
    );
    await page.mouse.up();

    await page.keyboard.press("Escape");

    await page.mouse.move(
      gridBox.x + BEAT_WIDTH * 3,
      gridBox.y + ROW_HEIGHT * 4,
    );
    await page.mouse.down();
    await page.mouse.move(
      gridBox.x + BEAT_WIDTH * 4,
      gridBox.y + ROW_HEIGHT * 4,
    );
    await page.mouse.up();

    await expect(page.locator("[data-testid^='note-']")).toHaveCount(2);

    // Delete the selected note (second one)
    await page.keyboard.press("Delete");
    await expect(page.locator("[data-testid^='note-']")).toHaveCount(1);

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // Should still have only 1 note
    await expect(page.locator("[data-testid^='note-']")).toHaveCount(1);
  });

  test("transient state resets on reload", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note (auto-selected)
    const startX = gridBox.x + BEAT_WIDTH * 1;
    const startY = gridBox.y + ROW_HEIGHT * 3;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();

    const note = page.locator("[data-testid^='note-']").first();
    await expect(note).toHaveAttribute("data-selected", "true");

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // Note should exist but NOT be selected (selection is transient)
    const restoredNote = page.locator("[data-testid^='note-']").first();
    await expect(restoredNote).toHaveCount(1);
    await expect(restoredNote).toHaveAttribute("data-selected", "false");

    // Time display should show 0:00 (playhead at start)
    const timeDisplay = page.getByTestId("time-display");
    await expect(timeDisplay).toContainText("0:00");
  });

  test("viewport state persists after reload", async ({ page }) => {
    // Get evaluateStore helper
    const { evaluateStore } = await import("./helpers");

    // Change viewport state by modifying store directly
    await evaluateStore(page, (store) => {
      const state = store.getState();
      state.setScrollX(25);
      state.setScrollY(60);
      state.setPixelsPerBeat(120);
      state.setPixelsPerKey(30);
      state.setWaveformHeight(100);
    });

    // Verify the changes were applied
    const changedScrollX = await evaluateStore(
      page,
      (store) => store.getState().scrollX,
    );
    expect(changedScrollX).toBe(25);

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // Verify viewport state was restored
    const restoredScrollX = await evaluateStore(
      page,
      (store) => store.getState().scrollX,
    );
    const restoredScrollY = await evaluateStore(
      page,
      (store) => store.getState().scrollY,
    );
    const restoredPixelsPerBeat = await evaluateStore(
      page,
      (store) => store.getState().pixelsPerBeat,
    );
    const restoredPixelsPerKey = await evaluateStore(
      page,
      (store) => store.getState().pixelsPerKey,
    );
    const restoredWaveformHeight = await evaluateStore(
      page,
      (store) => store.getState().waveformHeight,
    );

    expect(restoredScrollX).toBe(25);
    expect(restoredScrollY).toBe(60);
    expect(restoredPixelsPerBeat).toBe(120);
    expect(restoredPixelsPerKey).toBe(30);
    expect(restoredWaveformHeight).toBe(100);
  });
});
