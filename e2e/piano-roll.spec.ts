import { expect, test } from "@playwright/test";
import { clickNewProject } from "./helpers";

// Constants matching piano-roll.tsx
const BEAT_WIDTH = 80;
const ROW_HEIGHT = 20;

test.describe("Piano Roll", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("renders grid and keyboard", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    await expect(grid).toBeVisible();

    // Check keyboard C labels are visible (only C notes show labels now)
    await expect(page.getByText("C3")).toBeVisible();
    await expect(page.getByText("C4")).toBeVisible();
  });

  test("create, select, and delete note", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create note at beat 0, pitch G3 (top row)
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();

    // Note should be created and selected
    const note = page.locator("[data-testid^='note-']");
    await expect(note).toHaveCount(1);
    await expect(note).toHaveAttribute("data-selected", "true");

    // Press Escape to deselect
    await page.keyboard.press("Escape");
    await expect(note).toHaveAttribute("data-selected", "false");

    // Click on note to select
    await page.mouse.click(startX + BEAT_WIDTH * 0.25, startY);
    await expect(note).toHaveAttribute("data-selected", "true");

    // Delete with Delete key
    await page.keyboard.press("Delete");
    await expect(note).toHaveCount(0);

    // Create another note to test Backspace
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();

    await expect(note).toHaveCount(1);

    // Delete with Backspace key
    await page.keyboard.press("Backspace");
    await expect(note).toHaveCount(0);
  });

  test("move note", async ({ page }) => {
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
    const initialX = initialBox.x;
    const initialY = initialBox.y;

    // Drag note horizontally (time)
    const noteCenter = startX + BEAT_WIDTH * 0.25;
    await page.mouse.move(noteCenter, startY);
    await page.mouse.down();
    await page.mouse.move(noteCenter + BEAT_WIDTH * 2, startY);
    await page.mouse.up();

    let movedBox = await note.boundingBox();
    if (!movedBox) throw new Error("Note not found after move");
    expect(movedBox.x).toBeGreaterThan(initialX);

    // Drag note vertically (pitch)
    await page.mouse.move(
      movedBox.x + movedBox.width / 2,
      movedBox.y + movedBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      movedBox.x + movedBox.width / 2,
      movedBox.y - ROW_HEIGHT * 2,
    );
    await page.mouse.up();

    const finalBox = await note.boundingBox();
    if (!finalBox) throw new Error("Note not found after vertical move");
    expect(finalBox.y).toBeLessThan(initialY);
  });

  test("resize note", async ({ page }) => {
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
    const initialWidth = initialBox.width;
    const initialX = initialBox.x;

    // Drag right edge to extend
    const rightEdgeX = initialBox.x + initialBox.width - 2;
    const noteY = initialBox.y + initialBox.height / 2;
    await page.mouse.move(rightEdgeX, noteY);
    await page.mouse.down();
    await page.mouse.move(rightEdgeX + BEAT_WIDTH, noteY);
    await page.mouse.up();

    let resizedBox = await note.boundingBox();
    if (!resizedBox) throw new Error("Note not found after right resize");
    expect(resizedBox.width).toBeGreaterThan(initialWidth);

    // Drag left edge to shrink
    const leftEdgeX = resizedBox.x + 2;
    await page.mouse.move(leftEdgeX, noteY);
    await page.mouse.down();
    await page.mouse.move(leftEdgeX + BEAT_WIDTH * 0.5, noteY);
    await page.mouse.up();

    const finalBox = await note.boundingBox();
    if (!finalBox) throw new Error("Note not found after left resize");
    expect(finalBox.x).toBeGreaterThan(initialX);
    expect(finalBox.width).toBeLessThan(resizedBox.width);
  });

  // Test that resize snaps at the halfway point (uses Math.round, not Math.floor)
  //
  //   Grid (1/8 note = 0.5 beats = 40px)
  //       beat 1      beat 1.5     beat 2      beat 2.5
  //          |           |           |           |
  //          +-----------+-----------+-----------+
  //          |   40px    |   40px    |   40px    |
  //
  //   Initial: 1-beat note from beat 1 to beat 2
  //          [===========note========]
  //                                  ^ right edge at beat 2
  // Cell-based resize snap: cursor's cell determines the note end position.
  // The note end snaps to the right edge of the cursor's cell.
  //
  //   Grid: 0.5 beats per cell
  //   Cell 3: beats 1.5-2.0, Cell 4: beats 2.0-2.5, Cell 5: beats 2.5-3.0
  //
  //   Test 1: Cursor in cell 4 (beat 2.1) -> end snaps to 2.5
  //   Test 2: Cursor in cell 3 (beat 1.9) -> end snaps to 2.0 (shrinks back)
  //   Test 3: Cursor in cell 5 (beat 2.6) -> end snaps to 3.0 (extends)
  //
  test("resize snaps based on cursor cell (cell-based behavior)", async ({
    page,
  }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a 1-beat note at beat 1 (ends at beat 2)
    const noteStartBeat = 1;
    const noteDurationBeats = 1;
    const startX = gridBox.x + noteStartBeat * BEAT_WIDTH;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + noteDurationBeats * BEAT_WIDTH, startY);
    await page.mouse.up();

    const note = page.locator("[data-testid^='note-']").first();
    const initialBox = await note.boundingBox();
    if (!initialBox) throw new Error("Note not found");
    const noteY = initialBox.y + initialBox.height / 2;

    // Note ends at beat 2
    const noteEndX = gridBox.x + 2 * BEAT_WIDTH;

    // Test 1: Drag to beat 2.1 (cell 4: 2.0-2.5) -> end snaps to 2.5
    await page.mouse.move(noteEndX - 2, noteY);
    await page.mouse.down();
    await page.mouse.move(gridBox.x + 2.1 * BEAT_WIDTH, noteY);
    await page.mouse.up();

    let resizedBox = await note.boundingBox();
    if (!resizedBox) throw new Error("Note not found after resize");
    // End at 2.5 means duration = 1.5 beats = 120px
    expect(resizedBox.width).toBeCloseTo(BEAT_WIDTH * 1.5, 1);

    // Test 2: Drag to beat 1.9 (cell 3: 1.5-2.0) -> end snaps to 2.0 (shrinks)
    const newEndX = gridBox.x + 2.5 * BEAT_WIDTH;
    await page.mouse.move(newEndX - 2, noteY);
    await page.mouse.down();
    await page.mouse.move(gridBox.x + 1.9 * BEAT_WIDTH, noteY);
    await page.mouse.up();

    resizedBox = await note.boundingBox();
    if (!resizedBox) throw new Error("Note not found after resize");
    // End at 2.0 means duration = 1.0 beat = 80px
    expect(resizedBox.width).toBeCloseTo(BEAT_WIDTH, 1);

    // Test 3: Drag to beat 2.6 (cell 5: 2.5-3.0) -> end snaps to 3.0
    const currentEndX = gridBox.x + 2 * BEAT_WIDTH;
    await page.mouse.move(currentEndX - 2, noteY);
    await page.mouse.down();
    await page.mouse.move(gridBox.x + 2.6 * BEAT_WIDTH, noteY);
    await page.mouse.up();

    const finalBox = await note.boundingBox();
    if (!finalBox) throw new Error("Note not found after final resize");
    // End at 3.0 means duration = 2.0 beats = 160px
    expect(finalBox.width).toBeCloseTo(BEAT_WIDTH * 2, 1);
  });

  test("deselect with Escape", async ({ page }) => {
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

  test("multi-select with Shift+click", async ({ page }) => {
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

  test("box select with Shift+drag", async ({ page }) => {
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

  test("grid snap", async ({ page }) => {
    // Target the grid snap select trigger
    const gridSelect = page.getByTestId("grid-snap-select");
    await expect(gridSelect).toContainText("1/8");

    // Open dropdown and select 1/16
    await gridSelect.click();
    await page
      .getByRole("menuitemradio", { name: "1/16", exact: true })
      .click();
    await expect(gridSelect).toContainText("1/16");

    // Open dropdown and select 1/4
    await gridSelect.click();
    await page.getByRole("menuitemradio", { name: "1/4", exact: true }).click();
    await expect(gridSelect).toContainText("1/4");
  });

  test("keyboard preview", async ({ page }) => {
    // Find a keyboard key (e.g., C3 label)
    const c3Label = page.getByText("C3");
    await expect(c3Label).toBeVisible();

    // Get the bounding box of the keyboard key
    const keyBox = await c3Label.boundingBox();
    if (!keyBox) throw new Error("Keyboard key not found");

    // Click on the keyboard key to trigger preview
    // We can't directly test audio output in E2E, but we can verify the click works
    await page.mouse.click(
      keyBox.x + keyBox.width / 2,
      keyBox.y + keyBox.height / 2,
    );

    // The test passes if no errors occur - audio preview is played in the background
  });

  test("duplicate notes with Shift+drag", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note at beat 1
    const startX = gridBox.x + BEAT_WIDTH * 1.5;
    const startY = gridBox.y + ROW_HEIGHT * 2.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();

    // Verify one note is created and selected
    const notes = page.locator("[data-testid^='note-']");
    await expect(notes).toHaveCount(1);
    await expect(notes.first()).toHaveAttribute("data-selected", "true");

    // Get initial position of the note
    const initialBox = await notes.first().boundingBox();
    if (!initialBox) throw new Error("Note not found");
    const initialX = initialBox.x;
    const initialY = initialBox.y;

    // Shift+drag the selected note to duplicate it
    const noteCenter = initialBox.x + initialBox.width / 2;
    const noteMiddleY = initialBox.y + initialBox.height / 2;
    
    await page.keyboard.down("Shift");
    await page.mouse.move(noteCenter, noteMiddleY);
    await page.mouse.down();
    await page.mouse.move(noteCenter + BEAT_WIDTH * 2, noteMiddleY);
    await page.mouse.up();
    await page.keyboard.up("Shift");

    // Now there should be 2 notes (original + duplicate)
    await expect(notes).toHaveCount(2);

    // The original note should still be at the original position
    const originalNote = notes.first();
    const originalBox = await originalNote.boundingBox();
    if (!originalBox) throw new Error("Original note not found");
    expect(originalBox.x).toBeCloseTo(initialX, 1);
    expect(originalBox.y).toBeCloseTo(initialY, 1);

    // The duplicate should be moved to the right
    const duplicateNote = notes.last();
    const duplicateBox = await duplicateNote.boundingBox();
    if (!duplicateBox) throw new Error("Duplicate note not found");
    expect(duplicateBox.x).toBeGreaterThan(initialX);
    expect(duplicateBox.y).toBeCloseTo(initialY, 1); // Same pitch

    // The duplicate should be selected, original should not be
    await expect(originalNote).toHaveAttribute("data-selected", "false");
    await expect(duplicateNote).toHaveAttribute("data-selected", "true");
  });

  test("duplicate multiple selected notes with Shift+drag", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create first note
    const note1X = gridBox.x + BEAT_WIDTH * 1.5;
    const note1Y = gridBox.y + ROW_HEIGHT * 2.5;
    await page.mouse.move(note1X, note1Y);
    await page.mouse.down();
    await page.mouse.move(note1X + BEAT_WIDTH, note1Y);
    await page.mouse.up();

    // Create second note at different position
    await page.keyboard.press("Escape");
    const note2X = gridBox.x + BEAT_WIDTH * 1.5;
    const note2Y = gridBox.y + ROW_HEIGHT * 4.5;
    await page.mouse.move(note2X, note2Y);
    await page.mouse.down();
    await page.mouse.move(note2X + BEAT_WIDTH, note2Y);
    await page.mouse.up();

    // Select both notes with box select
    await page.keyboard.press("Escape");
    await page.keyboard.down("Shift");
    await page.mouse.move(note1X - BEAT_WIDTH * 0.5, note1Y - ROW_HEIGHT * 0.5);
    await page.mouse.down();
    await page.mouse.move(note2X + BEAT_WIDTH * 1.5, note2Y + ROW_HEIGHT * 0.5);
    await page.mouse.up();
    await page.keyboard.up("Shift");

    // Verify both notes are selected
    const notes = page.locator("[data-testid^='note-']");
    await expect(notes).toHaveCount(2);
    await expect(notes.nth(0)).toHaveAttribute("data-selected", "true");
    await expect(notes.nth(1)).toHaveAttribute("data-selected", "true");

    // Shift+drag one of the selected notes to duplicate both
    await page.keyboard.down("Shift");
    await page.mouse.move(note1X + BEAT_WIDTH * 0.5, note1Y);
    await page.mouse.down();
    await page.mouse.move(note1X + BEAT_WIDTH * 3, note1Y);
    await page.mouse.up();
    await page.keyboard.up("Shift");

    // Now there should be 4 notes (2 originals + 2 duplicates)
    await expect(notes).toHaveCount(4);

    // The original notes should not be selected
    await expect(notes.nth(0)).toHaveAttribute("data-selected", "false");
    await expect(notes.nth(1)).toHaveAttribute("data-selected", "false");

    // The duplicate notes should be selected
    await expect(notes.nth(2)).toHaveAttribute("data-selected", "true");
    await expect(notes.nth(3)).toHaveAttribute("data-selected", "true");
  });
});
