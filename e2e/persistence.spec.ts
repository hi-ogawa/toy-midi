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

  test("notes persist after page reload", async ({ page }) => {
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

  test("tempo persists after reload", async ({ page }) => {
    const tempoInput = page.getByTestId("tempo-input");
    await expect(tempoInput).toHaveValue("120");

    // Change tempo
    await tempoInput.fill("95");
    await tempoInput.blur();
    await expect(tempoInput).toHaveValue("95");

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // Tempo should be restored
    await expect(page.getByTestId("tempo-input")).toHaveValue("95");
  });

  test("grid snap persists after reload", async ({ page }) => {
    const gridSelect = page.locator("select").first();
    await expect(gridSelect).toHaveValue("1/8");

    // Change grid snap
    await gridSelect.selectOption("1/16");
    await expect(gridSelect).toHaveValue("1/16");

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // Grid snap should be restored
    await expect(page.locator("select").first()).toHaveValue("1/16");
  });

  test("metronome setting persists after reload", async ({ page }) => {
    const metronomeToggle = page.getByTestId("metronome-toggle");
    await expect(metronomeToggle).toHaveAttribute("aria-pressed", "false");

    // Enable metronome
    await metronomeToggle.click();
    await expect(metronomeToggle).toHaveAttribute("aria-pressed", "true");

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // Metronome should still be enabled
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

  test("selection is not persisted (transient state)", async ({ page }) => {
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
  });

  test("playhead position resets on reload (transient state)", async ({
    page,
  }) => {
    // This test verifies that playhead resets to 0 on reload
    // Since we can't easily move playhead without playing, we just verify
    // the initial state is correct after reload with persisted data

    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note to ensure we have persisted state
    await page.mouse.move(
      gridBox.x + BEAT_WIDTH * 1,
      gridBox.y + ROW_HEIGHT * 3,
    );
    await page.mouse.down();
    await page.mouse.move(
      gridBox.x + BEAT_WIDTH * 2,
      gridBox.y + ROW_HEIGHT * 3,
    );
    await page.mouse.up();

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and click Continue to restore
    await page.reload();
    await clickContinue(page);

    // Time display should show 0:00 (playhead at start)
    const timeDisplay = page.getByTestId("time-display");
    await expect(timeDisplay).toContainText("0:00");
  });
});
