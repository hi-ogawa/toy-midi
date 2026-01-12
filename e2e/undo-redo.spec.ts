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

  test("undo multi-note move in single operation", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    const notes = page.locator("[data-testid^='note-']");

    // Create first note at row 5
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const row1Y = gridBox.y + ROW_HEIGHT * 5.5;
    await page.mouse.move(startX, row1Y);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, row1Y);
    await page.mouse.up();
    await expect(notes).toHaveCount(1);

    // Create second note at row 6
    const row2Y = gridBox.y + ROW_HEIGHT * 6.5;
    await page.mouse.move(startX, row2Y);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, row2Y);
    await page.mouse.up();
    await expect(notes).toHaveCount(2);

    // Get initial positions
    const note1 = notes.nth(0);
    const note2 = notes.nth(1);
    const initial1 = await note1.boundingBox();
    const initial2 = await note2.boundingBox();
    if (!initial1 || !initial2) throw new Error("Notes not found");

    // Box select both notes (shift+drag)
    await page.mouse.move(gridBox.x, gridBox.y + ROW_HEIGHT * 5);
    await page.keyboard.down("Shift");
    await page.mouse.down();
    await page.mouse.move(
      gridBox.x + BEAT_WIDTH * 2,
      gridBox.y + ROW_HEIGHT * 7.5,
    );
    await page.mouse.up();
    await page.keyboard.up("Shift");

    // Both notes should be selected (verify via visual or just proceed)
    // Move both notes by dragging one
    const moveStartX = initial1.x + initial1.width / 2;
    const moveStartY = initial1.y + initial1.height / 2;
    await page.mouse.move(moveStartX, moveStartY);
    await page.mouse.down();
    await page.mouse.move(moveStartX + BEAT_WIDTH * 2, moveStartY);
    await page.mouse.up();

    // Verify both notes moved
    const moved1 = await note1.boundingBox();
    const moved2 = await note2.boundingBox();
    if (!moved1 || !moved2) throw new Error("Notes not found after move");
    expect(moved1.x).toBeGreaterThan(initial1.x);
    expect(moved2.x).toBeGreaterThan(initial2.x);

    // Single undo should restore BOTH notes to original position
    await page.keyboard.press("Control+z");

    const undone1 = await note1.boundingBox();
    const undone2 = await note2.boundingBox();
    if (!undone1 || !undone2) throw new Error("Notes not found after undo");
    expect(Math.abs(undone1.x - initial1.x)).toBeLessThan(2);
    expect(Math.abs(undone2.x - initial2.x)).toBeLessThan(2);

    // Redo should move both back
    await page.keyboard.press("Control+y");

    const redone1 = await note1.boundingBox();
    const redone2 = await note2.boundingBox();
    if (!redone1 || !redone2) throw new Error("Notes not found after redo");
    expect(Math.abs(redone1.x - moved1.x)).toBeLessThan(2);
    expect(Math.abs(redone2.x - moved2.x)).toBeLessThan(2);
  });

  test("drag through many steps creates single undo entry", async ({
    page,
  }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note
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

    // Drag note through MANY intermediate steps (simulating a long drag)
    const noteCenter = startX + BEAT_WIDTH * 0.5;
    await page.mouse.move(noteCenter, startY);
    await page.mouse.down();

    // Move through 10 intermediate positions
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(noteCenter + BEAT_WIDTH * 0.3 * i, startY);
    }
    await page.mouse.up();

    // Verify note moved to final position
    const movedBox = await note.boundingBox();
    if (!movedBox) throw new Error("Note not found after move");
    expect(movedBox.x).toBeGreaterThan(initialX);

    // Single undo should restore to original position (not just one step back)
    await page.keyboard.press("Control+z");

    const undoneBox = await note.boundingBox();
    if (!undoneBox) throw new Error("Note not found after undo");
    expect(Math.abs(undoneBox.x - initialX)).toBeLessThan(2);

    // A second undo should undo the note creation (not another drag step)
    await page.keyboard.press("Control+z");
    await expect(note).toHaveCount(0);

    // Redo should recreate note
    await page.keyboard.press("Control+y");
    await expect(note).toHaveCount(1);

    // Second redo should move note back to final dragged position
    await page.keyboard.press("Control+y");
    const redoneMoved = await note.boundingBox();
    if (!redoneMoved) throw new Error("Note not found after redo");
    expect(Math.abs(redoneMoved.x - movedBox.x)).toBeLessThan(2);
  });
});
