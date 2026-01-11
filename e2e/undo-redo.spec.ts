import { expect, test } from "@playwright/test";
import { clickNewProject } from "./helpers";

// Constants matching piano-roll.tsx
const BEAT_WIDTH = 80;
const ROW_HEIGHT = 20;

test.describe("Undo/Redo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("undo create note", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();

    // Verify note was created
    const note = page.locator("[data-testid^='note-']");
    await expect(note).toHaveCount(1);

    // Undo with Ctrl+Z
    await page.keyboard.press("Control+z");

    // Verify note was removed
    await expect(note).toHaveCount(0);
  });

  test("undo delete note", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();

    const note = page.locator("[data-testid^='note-']");
    await expect(note).toHaveCount(1);

    // Delete the note
    await page.keyboard.press("Delete");
    await expect(note).toHaveCount(0);

    // Undo delete
    await page.keyboard.press("Control+z");

    // Verify note was restored
    await expect(note).toHaveCount(1);
  });

  test("undo move note", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note at row 5
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 5.5;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();

    const note = page.locator("[data-testid^='note-']").first();
    const initialBox = await note.boundingBox();
    if (!initialBox) throw new Error("Note not found");
    const initialX = initialBox.x;
    const initialY = initialBox.y;

    // Move note horizontally
    const noteCenter = startX + BEAT_WIDTH * 0.5;
    await page.mouse.move(noteCenter, startY);
    await page.mouse.down();
    await page.mouse.move(noteCenter + BEAT_WIDTH * 2, startY);
    await page.mouse.up();

    // Verify note moved
    const movedBox = await note.boundingBox();
    if (!movedBox) throw new Error("Note not found after move");
    expect(movedBox.x).toBeGreaterThan(initialX);

    // Undo move
    await page.keyboard.press("Control+z");

    // Verify note returned to original position
    const undoneBox = await note.boundingBox();
    if (!undoneBox) throw new Error("Note not found after undo");
    expect(Math.abs(undoneBox.x - initialX)).toBeLessThan(2); // Allow small rounding error
    expect(Math.abs(undoneBox.y - initialY)).toBeLessThan(2);
  });

  test("undo resize note", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();

    const note = page.locator("[data-testid^='note-']").first();
    const initialBox = await note.boundingBox();
    if (!initialBox) throw new Error("Note not found");
    const initialWidth = initialBox.width;

    // Resize note from right edge
    await page.mouse.move(
      initialBox.x + initialBox.width - 2,
      initialBox.y + initialBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      initialBox.x + initialBox.width + BEAT_WIDTH,
      initialBox.y + initialBox.height / 2,
    );
    await page.mouse.up();

    // Verify note was resized
    const resizedBox = await note.boundingBox();
    if (!resizedBox) throw new Error("Note not found after resize");
    expect(resizedBox.width).toBeGreaterThan(initialWidth);

    // Undo resize
    await page.keyboard.press("Control+z");

    // Verify note returned to original size
    const undoneBox = await note.boundingBox();
    if (!undoneBox) throw new Error("Note not found after undo");
    expect(Math.abs(undoneBox.width - initialWidth)).toBeLessThan(2);
  });

  test("redo after undo", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();

    const note = page.locator("[data-testid^='note-']");
    await expect(note).toHaveCount(1);

    // Undo create
    await page.keyboard.press("Control+z");
    await expect(note).toHaveCount(0);

    // Redo with Ctrl+Shift+Z
    await page.keyboard.press("Control+Shift+z");
    await expect(note).toHaveCount(1);

    // Undo again
    await page.keyboard.press("Control+z");
    await expect(note).toHaveCount(0);

    // Redo with Ctrl+Y (alternative)
    await page.keyboard.press("Control+y");
    await expect(note).toHaveCount(1);
  });

  test("multiple undo operations", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    const note = page.locator("[data-testid^='note-']");

    // Create first note
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();
    await expect(note).toHaveCount(1);

    // Create second note
    await page.mouse.move(startX, startY + ROW_HEIGHT);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY + ROW_HEIGHT);
    await page.mouse.up();
    await expect(note).toHaveCount(2);

    // Create third note
    await page.mouse.move(startX, startY + ROW_HEIGHT * 2);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY + ROW_HEIGHT * 2);
    await page.mouse.up();
    await expect(note).toHaveCount(3);

    // Undo third note
    await page.keyboard.press("Control+z");
    await expect(note).toHaveCount(2);

    // Undo second note
    await page.keyboard.press("Control+z");
    await expect(note).toHaveCount(1);

    // Undo first note
    await page.keyboard.press("Control+z");
    await expect(note).toHaveCount(0);

    // Redo all
    await page.keyboard.press("Control+y");
    await expect(note).toHaveCount(1);
    await page.keyboard.press("Control+y");
    await expect(note).toHaveCount(2);
    await page.keyboard.press("Control+y");
    await expect(note).toHaveCount(3);
  });

  test("new operation clears redo stack", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    const note = page.locator("[data-testid^='note-']");

    // Create a note
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();
    await expect(note).toHaveCount(1);

    // Undo
    await page.keyboard.press("Control+z");
    await expect(note).toHaveCount(0);

    // Create a different note (should clear redo stack)
    await page.mouse.move(startX, startY + ROW_HEIGHT);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY + ROW_HEIGHT);
    await page.mouse.up();
    await expect(note).toHaveCount(1);

    // Redo should not bring back the first note
    await page.keyboard.press("Control+y");
    await expect(note).toHaveCount(1); // Still just one note

    // But can undo the new note
    await page.keyboard.press("Control+z");
    await expect(note).toHaveCount(0);
  });

  test("history cleared on project load", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    const note = page.locator("[data-testid^='note-']");

    // Create a note
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();
    await expect(note).toHaveCount(1);

    // Wait for auto-save (debounced at 500ms)
    await page.waitForTimeout(600);

    // Reload page (which will load project from localStorage)
    await page.reload();

    // Click Continue to restore the project
    const continueButton = page.getByTestId("continue-button");
    await continueButton.waitFor({ state: "visible", timeout: 10000 });
    await continueButton.click();
    await page.getByTestId("transport").waitFor({ state: "visible" });

    // Note should still be there
    await expect(note).toHaveCount(1);

    // But undo should not work (history cleared on load)
    await page.keyboard.press("Control+z");
    await expect(note).toHaveCount(1); // Note should still be there
  });
});
