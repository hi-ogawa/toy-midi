import { expect, test } from "@playwright/test";
import { clickNewProject } from "./helpers";

// Constants matching piano-roll.tsx
const BEAT_WIDTH = 80;
const ROW_HEIGHT = 20;

test.describe("Copy/Paste", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("copy and paste single note", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note at beat 0, pitch G3 (top row)
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();

    // Note should be created and selected
    const notes = page.locator("[data-testid^='note-']");
    await expect(notes).toHaveCount(1);

    // Copy with Ctrl+C
    await page.keyboard.press("Control+c");

    // Paste with Ctrl+V
    await page.keyboard.press("Control+v");

    // Should now have 2 notes
    await expect(notes).toHaveCount(2);

    // Wait for selection state to update
    await page.waitForTimeout(100);

    // The pasted note (second note) should be selected, first should not
    const note1 = notes.nth(0);
    const note2 = notes.nth(1);
    await expect(note1).toHaveAttribute("data-selected", "false");
    await expect(note2).toHaveAttribute("data-selected", "true");

    // The second note should be positioned after the first
    const note1Box = await notes.nth(0).boundingBox();
    const note2Box = await notes.nth(1).boundingBox();
    if (!note1Box || !note2Box) throw new Error("Notes not found");
    expect(note2Box.x).toBeGreaterThan(note1Box.x);
    // Same pitch (same y position)
    expect(Math.abs(note2Box.y - note1Box.y)).toBeLessThan(2);
  });

  test("copy and paste multiple notes", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    const notes = page.locator("[data-testid^='note-']");

    // Create first note at beat 0
    const note1X = gridBox.x + BEAT_WIDTH * 0.5;
    const note1Y = gridBox.y + ROW_HEIGHT * 0.5;
    await page.mouse.move(note1X, note1Y);
    await page.mouse.down();
    await page.mouse.move(note1X + BEAT_WIDTH, note1Y);
    await page.mouse.up();
    await expect(notes).toHaveCount(1);

    // Press Escape to deselect
    await page.keyboard.press("Escape");

    // Create second note at beat 2, different pitch
    const note2X = gridBox.x + BEAT_WIDTH * 2.5;
    const note2Y = gridBox.y + ROW_HEIGHT * 2.5;
    await page.mouse.move(note2X, note2Y);
    await page.mouse.down();
    await page.mouse.move(note2X + BEAT_WIDTH, note2Y);
    await page.mouse.up();
    await expect(notes).toHaveCount(2);

    // Escape to deselect
    await page.keyboard.press("Escape");

    // Box select both notes
    const boxStartX = gridBox.x + BEAT_WIDTH * 0.2;
    const boxStartY = gridBox.y + ROW_HEIGHT * 0.2;
    const boxEndX = gridBox.x + BEAT_WIDTH * 4;
    const boxEndY = gridBox.y + ROW_HEIGHT * 4;

    await page.keyboard.down("Shift");
    await page.mouse.move(boxStartX, boxStartY);
    await page.mouse.down();
    await page.mouse.move(boxEndX, boxEndY);
    await page.mouse.up();
    await page.keyboard.up("Shift");

    // Both notes should be selected - check individually
    const note1 = notes.nth(0);
    const note2 = notes.nth(1);
    await expect(note1).toHaveAttribute("data-selected", "true");
    await expect(note2).toHaveAttribute("data-selected", "true");

    // Copy
    await page.keyboard.press("Control+c");

    // Paste
    await page.keyboard.press("Control+v");

    // Should now have 4 notes total
    await expect(notes).toHaveCount(4);

    // Wait for selection state to update
    await page.waitForTimeout(100);

    // The 2 pasted notes should be selected (notes 2 and 3)
    await expect(notes.nth(0)).toHaveAttribute("data-selected", "false");
    await expect(notes.nth(1)).toHaveAttribute("data-selected", "false");
    await expect(notes.nth(2)).toHaveAttribute("data-selected", "true");
    await expect(notes.nth(3)).toHaveAttribute("data-selected", "true");
  });

  test("paste multiple times creates incremental offsets", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    const notes = page.locator("[data-testid^='note-']");

    // Create a note
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();
    await expect(notes).toHaveCount(1);

    // Get initial note position
    const note1Box = await notes.nth(0).boundingBox();
    if (!note1Box) throw new Error("Note not found");

    // Copy
    await page.keyboard.press("Control+c");

    // Paste first time
    await page.keyboard.press("Control+v");
    await expect(notes).toHaveCount(2);

    const note2Box = await notes.nth(1).boundingBox();
    if (!note2Box) throw new Error("Second note not found");
    const offset1 = note2Box.x - note1Box.x;
    expect(offset1).toBeGreaterThan(0);

    // Paste second time (pasted note is now selected)
    await page.keyboard.press("Control+v");
    await expect(notes).toHaveCount(3);

    const note3Box = await notes.nth(2).boundingBox();
    if (!note3Box) throw new Error("Third note not found");
    const offset2 = note3Box.x - note2Box.x;

    // Second paste should have same offset as first
    expect(Math.abs(offset2 - offset1)).toBeLessThan(2);
  });

  test("paste with undo/redo", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    const notes = page.locator("[data-testid^='note-']");

    // Create a note
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();
    await expect(notes).toHaveCount(1);

    // Copy and paste
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await expect(notes).toHaveCount(2);

    // Undo paste
    await page.keyboard.press("Control+z");
    await expect(notes).toHaveCount(1);

    // Redo paste
    await page.keyboard.press("Control+y");
    await expect(notes).toHaveCount(2);
  });

  test("copy preserves note properties", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    const notes = page.locator("[data-testid^='note-']");

    // Create a note with specific duration (2 beats)
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 2.5; // Different row
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH * 2, startY);
    await page.mouse.up();
    await expect(notes).toHaveCount(1);

    // Get original note dimensions
    const note1Box = await notes.nth(0).boundingBox();
    if (!note1Box) throw new Error("Note not found");

    // Copy and paste
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await expect(notes).toHaveCount(2);

    // Get pasted note dimensions
    const note2Box = await notes.nth(1).boundingBox();
    if (!note2Box) throw new Error("Pasted note not found");

    // Width (duration) should be the same
    expect(Math.abs(note2Box.width - note1Box.width)).toBeLessThan(2);
    // Height (pitch) should be the same
    expect(Math.abs(note2Box.height - note1Box.height)).toBeLessThan(2);
    // Y position (pitch) should be the same
    expect(Math.abs(note2Box.y - note1Box.y)).toBeLessThan(2);
  });

  test("paste when no notes selected", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    const notes = page.locator("[data-testid^='note-']");

    // Create a note
    const startX = gridBox.x + BEAT_WIDTH * 0.5;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();
    await expect(notes).toHaveCount(1);

    // Get original note position
    const note1Box = await notes.nth(0).boundingBox();
    if (!note1Box) throw new Error("Note not found");

    // Copy
    await page.keyboard.press("Control+c");

    // Deselect all
    await page.keyboard.press("Escape");

    // Paste (when nothing is selected, should paste at beat 0 offset)
    await page.keyboard.press("Control+v");
    await expect(notes).toHaveCount(2);

    // The pasted note should be at or near the original position (no offset when nothing selected)
    const note2Box = await notes.nth(1).boundingBox();
    if (!note2Box) throw new Error("Pasted note not found");
    expect(note2Box.x).toBeGreaterThanOrEqual(note1Box.x);
  });

  test("copy with no selection does nothing", async ({ page }) => {
    const notes = page.locator("[data-testid^='note-']");

    // Try to copy without any notes
    await page.keyboard.press("Control+c");

    // Try to paste
    await page.keyboard.press("Control+v");

    // Should still have no notes
    await expect(notes).toHaveCount(0);
  });
});
