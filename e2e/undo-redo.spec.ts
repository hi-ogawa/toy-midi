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

  test("create and delete note with undo/redo", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    const note = page.locator("[data-testid^='note-']");
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;

    // Create a note
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();
    await expect(note).toHaveCount(1);

    // Undo create with Ctrl+Z
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

    // Delete the note
    await page.keyboard.press("Delete");
    await expect(note).toHaveCount(0);

    // Undo delete
    await page.keyboard.press("Control+z");
    await expect(note).toHaveCount(1);

    // Redo delete
    await page.keyboard.press("Control+y");
    await expect(note).toHaveCount(0);
  });

  test("move and resize note with undo/redo", async ({ page }) => {
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
    const initialWidth = initialBox.width;

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
    const undoneBox = await note.boundingBox();
    if (!undoneBox) throw new Error("Note not found after undo");
    expect(Math.abs(undoneBox.x - initialX)).toBeLessThan(2);
    expect(Math.abs(undoneBox.y - initialY)).toBeLessThan(2);

    // Redo move
    await page.keyboard.press("Control+y");
    const redoneMoveBox = await note.boundingBox();
    if (!redoneMoveBox) throw new Error("Note not found after redo");
    expect(Math.abs(redoneMoveBox.x - movedBox.x)).toBeLessThan(2);

    // Undo move again for resize test
    await page.keyboard.press("Control+z");

    // Resize note from right edge
    const resizeBox = await note.boundingBox();
    if (!resizeBox) throw new Error("Note not found for resize");
    await page.mouse.move(
      resizeBox.x + resizeBox.width - 2,
      resizeBox.y + resizeBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      resizeBox.x + resizeBox.width + BEAT_WIDTH,
      resizeBox.y + resizeBox.height / 2,
    );
    await page.mouse.up();

    // Verify note was resized
    const resizedBox = await note.boundingBox();
    if (!resizedBox) throw new Error("Note not found after resize");
    expect(resizedBox.width).toBeGreaterThan(initialWidth);

    // Undo resize
    await page.keyboard.press("Control+z");
    const undoneResizeBox = await note.boundingBox();
    if (!undoneResizeBox) throw new Error("Note not found after undo resize");
    expect(Math.abs(undoneResizeBox.width - initialWidth)).toBeLessThan(2);
  });

  test("multiple operations and redo stack behavior", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    const notes = page.locator("[data-testid^='note-']");
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;

    // Create three notes
    for (let i = 0; i < 3; i++) {
      await page.mouse.move(startX, startY + ROW_HEIGHT * i);
      await page.mouse.down();
      await page.mouse.move(startX + BEAT_WIDTH, startY + ROW_HEIGHT * i);
      await page.mouse.up();
    }
    await expect(notes).toHaveCount(3);

    // Undo all three
    await page.keyboard.press("Control+z");
    await expect(notes).toHaveCount(2);
    await page.keyboard.press("Control+z");
    await expect(notes).toHaveCount(1);
    await page.keyboard.press("Control+z");
    await expect(notes).toHaveCount(0);

    // Redo all three
    await page.keyboard.press("Control+y");
    await expect(notes).toHaveCount(1);
    await page.keyboard.press("Control+y");
    await expect(notes).toHaveCount(2);
    await page.keyboard.press("Control+y");
    await expect(notes).toHaveCount(3);

    // Undo one
    await page.keyboard.press("Control+z");
    await expect(notes).toHaveCount(2);

    // Create a new note (should clear redo stack)
    await page.mouse.move(startX + BEAT_WIDTH * 3, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH * 4, startY);
    await page.mouse.up();
    await expect(notes).toHaveCount(3);

    // Redo should not bring back the undone note (redo stack cleared)
    await page.keyboard.press("Control+y");
    await expect(notes).toHaveCount(3);

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload and restore project
    await page.reload();
    const continueButton = page.getByTestId("continue-button");
    await continueButton.waitFor({ state: "visible", timeout: 10000 });
    await continueButton.click();
    await page.getByTestId("transport").waitFor({ state: "visible" });

    // Notes should still be there
    await expect(notes).toHaveCount(3);

    // Undo should not work (history cleared on load)
    await page.keyboard.press("Control+z");
    await expect(notes).toHaveCount(3);
  });

  test("multi-note moves and drag coalescing", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    const notes = page.locator("[data-testid^='note-']");
    const startX = gridBox.x + BEAT_WIDTH * 0.5;

    // Create two notes at rows 5 and 6
    const row1Y = gridBox.y + ROW_HEIGHT * 5.5;
    const row2Y = gridBox.y + ROW_HEIGHT * 6.5;

    await page.mouse.move(startX, row1Y);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, row1Y);
    await page.mouse.up();

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

    // Single undo should restore BOTH notes
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

    // Undo both notes to test drag coalescing
    await page.keyboard.press("Control+z"); // undo move
    await page.keyboard.press("Control+z"); // undo second note
    await page.keyboard.press("Control+z"); // undo first note
    await expect(notes).toHaveCount(0);

    // Redo one note for drag coalescing test
    await page.keyboard.press("Control+y");
    await expect(notes).toHaveCount(1);

    const singleNote = notes.first();
    const singleInitial = await singleNote.boundingBox();
    if (!singleInitial) throw new Error("Note not found");

    // Drag note through MANY intermediate steps
    await page.mouse.move(
      singleInitial.x + singleInitial.width / 2,
      singleInitial.y + singleInitial.height / 2,
    );
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(
        singleInitial.x + singleInitial.width / 2 + BEAT_WIDTH * 0.3 * i,
        singleInitial.y + singleInitial.height / 2,
      );
    }
    await page.mouse.up();

    // Verify note moved
    const draggedBox = await singleNote.boundingBox();
    if (!draggedBox) throw new Error("Note not found after drag");
    expect(draggedBox.x).toBeGreaterThan(singleInitial.x);

    // Single undo should restore to original (not just one step back)
    await page.keyboard.press("Control+z");
    const undraggedBox = await singleNote.boundingBox();
    if (!undraggedBox) throw new Error("Note not found after undo drag");
    expect(Math.abs(undraggedBox.x - singleInitial.x)).toBeLessThan(2);

    // Second undo should undo the note creation (not another drag step)
    await page.keyboard.press("Control+z");
    await expect(notes).toHaveCount(0);
  });
});
