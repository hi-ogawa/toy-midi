import { expect, test } from "@playwright/test";

// Constants matching piano-roll.tsx
const BEAT_WIDTH = 80;
const ROW_HEIGHT = 20;

test.describe("Piano Roll", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders grid and keyboard", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    await expect(grid).toBeVisible();

    // Check keyboard C labels are visible (only C notes show labels now)
    await expect(page.getByText("C3")).toBeVisible();
    await expect(page.getByText("C2")).toBeVisible();
  });

  test("creates note on click-drag", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create note at beat 0, pitch G3 (top row)
    const startX = gridBox.x + BEAT_WIDTH * 0.5; // middle of beat 0
    const startY = gridBox.y + ROW_HEIGHT * 0.5; // G3 row

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY); // drag 1 beat
    await page.mouse.up();

    // Note should be created
    const note = page.locator("[data-testid^='note-']");
    await expect(note).toHaveCount(1);
    await expect(note).toHaveAttribute("data-selected", "true");
  });

  test("selects note on click", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note first
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();

    // Click elsewhere to deselect
    await page.mouse.click(
      gridBox.x + BEAT_WIDTH * 5,
      gridBox.y + ROW_HEIGHT * 5,
    );

    const note = page.locator("[data-testid^='note-']").first();
    await expect(note).toHaveAttribute("data-selected", "false");

    // Click on note to select
    await page.mouse.click(startX + BEAT_WIDTH * 0.25, startY);
    await expect(note).toHaveAttribute("data-selected", "true");
  });

  test("deletes selected note with Delete key", async ({ page }) => {
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

    // Delete with Delete key
    await page.keyboard.press("Delete");
    await expect(note).toHaveCount(0);
  });

  test("moves note by dragging body", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note at beat 0
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();

    const note = page.locator("[data-testid^='note-']").first();
    const initialBox = await note.boundingBox();
    if (!initialBox) throw new Error("Note not found");
    const initialX = initialBox.x;

    // Drag note to beat 2
    const noteCenter = startX + BEAT_WIDTH * 0.25;
    await page.mouse.move(noteCenter, startY);
    await page.mouse.down();
    await page.mouse.move(noteCenter + BEAT_WIDTH * 2, startY);
    await page.mouse.up();

    // Note should have moved
    const finalBox = await note.boundingBox();
    if (!finalBox) throw new Error("Note not found after move");
    expect(finalBox.x).toBeGreaterThan(initialX);
  });

  test("changes grid snap", async ({ page }) => {
    // Target the grid snap select specifically (first select in toolbar)
    const gridSelect = page.locator("select").first();
    await expect(gridSelect).toHaveValue("1/8");

    await gridSelect.selectOption("1/16");
    await expect(gridSelect).toHaveValue("1/16");

    await gridSelect.selectOption("1/4");
    await expect(gridSelect).toHaveValue("1/4");
  });

  test("deletes selected note with Backspace key", async ({ page }) => {
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

    // Delete with Backspace key
    await page.keyboard.press("Backspace");
    await expect(note).toHaveCount(0);
  });

  test("deselects all notes with Escape key", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note (auto-selected after creation)
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();

    const note = page.locator("[data-testid^='note-']").first();
    await expect(note).toHaveAttribute("data-selected", "true");

    // Press Escape to deselect
    await page.keyboard.press("Escape");
    await expect(note).toHaveAttribute("data-selected", "false");
  });

  test("selects multiple notes with Shift+click", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create first note at beat 0
    const note1X = gridBox.x + BEAT_WIDTH * 0.5;
    const note1Y = gridBox.y + ROW_HEIGHT * 0.5;
    await page.mouse.move(note1X, note1Y);
    await page.mouse.down();
    await page.mouse.move(note1X + BEAT_WIDTH, note1Y);
    await page.mouse.up();

    // Press Escape to deselect before creating second note
    await page.keyboard.press("Escape");

    // Create second note at beat 2
    const note2X = gridBox.x + BEAT_WIDTH * 2.5;
    const note2Y = gridBox.y + ROW_HEIGHT * 2.5;
    await page.mouse.move(note2X, note2Y);
    await page.mouse.down();
    await page.mouse.move(note2X + BEAT_WIDTH, note2Y);
    await page.mouse.up();

    const notes = page.locator("[data-testid^='note-']");
    await expect(notes).toHaveCount(2);

    // Second note should be selected, first should not be
    const note1 = notes.first();
    const note2 = notes.last();
    await expect(note1).toHaveAttribute("data-selected", "false");
    await expect(note2).toHaveAttribute("data-selected", "true");

    // Shift+click on first note to add to selection
    await page.keyboard.down("Shift");
    await page.mouse.click(note1X + BEAT_WIDTH * 0.25, note1Y);
    await page.keyboard.up("Shift");

    // Both notes should now be selected
    await expect(note1).toHaveAttribute("data-selected", "true");
    await expect(note2).toHaveAttribute("data-selected", "true");
  });

  test("box selects notes with Shift+drag on empty area", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create two notes
    const note1X = gridBox.x + BEAT_WIDTH * 1;
    const note1Y = gridBox.y + ROW_HEIGHT * 2;
    await page.mouse.move(note1X, note1Y);
    await page.mouse.down();
    await page.mouse.move(note1X + BEAT_WIDTH, note1Y);
    await page.mouse.up();

    await page.keyboard.press("Escape");

    const note2X = gridBox.x + BEAT_WIDTH * 2;
    const note2Y = gridBox.y + ROW_HEIGHT * 3;
    await page.mouse.move(note2X, note2Y);
    await page.mouse.down();
    await page.mouse.move(note2X + BEAT_WIDTH, note2Y);
    await page.mouse.up();

    await page.keyboard.press("Escape");

    const notes = page.locator("[data-testid^='note-']");
    await expect(notes).toHaveCount(2);

    // Both should be deselected
    await expect(notes.first()).toHaveAttribute("data-selected", "false");
    await expect(notes.last()).toHaveAttribute("data-selected", "false");

    // Shift+drag a box that covers both notes
    const boxStartX = gridBox.x + BEAT_WIDTH * 0.5;
    const boxStartY = gridBox.y + ROW_HEIGHT * 1.5;
    const boxEndX = gridBox.x + BEAT_WIDTH * 3.5;
    const boxEndY = gridBox.y + ROW_HEIGHT * 4.5;

    await page.keyboard.down("Shift");
    await page.mouse.move(boxStartX, boxStartY);
    await page.mouse.down();
    await page.mouse.move(boxEndX, boxEndY);
    await page.mouse.up();
    await page.keyboard.up("Shift");

    // Both notes should now be selected
    await expect(notes.first()).toHaveAttribute("data-selected", "true");
    await expect(notes.last()).toHaveAttribute("data-selected", "true");
  });

  test("resizes note from right edge", async ({ page }) => {
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

    // Drag right edge to extend the note
    const rightEdgeX = initialBox.x + initialBox.width - 2;
    const noteY = initialBox.y + initialBox.height / 2;
    await page.mouse.move(rightEdgeX, noteY);
    await page.mouse.down();
    await page.mouse.move(rightEdgeX + BEAT_WIDTH, noteY);
    await page.mouse.up();

    // Note should be wider
    const finalBox = await note.boundingBox();
    if (!finalBox) throw new Error("Note not found after resize");
    expect(finalBox.width).toBeGreaterThan(initialWidth);
  });

  test("resizes note from left edge", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note at beat 2 (so we have room to resize left)
    const startX = gridBox.x + BEAT_WIDTH * 2;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH * 2, startY);
    await page.mouse.up();

    const note = page.locator("[data-testid^='note-']").first();
    const initialBox = await note.boundingBox();
    if (!initialBox) throw new Error("Note not found");
    const initialX = initialBox.x;
    const initialWidth = initialBox.width;

    // Drag left edge to shrink the note
    const leftEdgeX = initialBox.x + 2;
    const noteY = initialBox.y + initialBox.height / 2;
    await page.mouse.move(leftEdgeX, noteY);
    await page.mouse.down();
    await page.mouse.move(leftEdgeX + BEAT_WIDTH * 0.5, noteY);
    await page.mouse.up();

    // Note should have moved right and be narrower
    const finalBox = await note.boundingBox();
    if (!finalBox) throw new Error("Note not found after resize");
    expect(finalBox.x).toBeGreaterThan(initialX);
    expect(finalBox.width).toBeLessThan(initialWidth);
  });

  test("moves note pitch by dragging vertically", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note at row 5 (to have room to move up)
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 5.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();

    const note = page.locator("[data-testid^='note-']").first();
    const initialBox = await note.boundingBox();
    if (!initialBox) throw new Error("Note not found");
    const initialY = initialBox.y;

    // Drag note upward (higher pitch)
    const noteCenter = initialBox.x + initialBox.width / 2;
    await page.mouse.move(noteCenter, initialBox.y + initialBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(noteCenter, initialBox.y - ROW_HEIGHT * 2);
    await page.mouse.up();

    // Note should have moved up
    const finalBox = await note.boundingBox();
    if (!finalBox) throw new Error("Note not found after move");
    expect(finalBox.y).toBeLessThan(initialY);
  });
});
