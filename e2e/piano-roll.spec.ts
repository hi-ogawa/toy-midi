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
    await expect(page.getByText("C2")).toBeVisible();
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
    // Use data-testid to target the grid snap select specifically
    const gridSelect = page.getByTestId("grid-snap-select");
    await expect(gridSelect).toHaveValue("1/8");

    await gridSelect.selectOption("1/16");
    await expect(gridSelect).toHaveValue("1/16");

    await gridSelect.selectOption("1/4");
    await expect(gridSelect).toHaveValue("1/4");
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
});
