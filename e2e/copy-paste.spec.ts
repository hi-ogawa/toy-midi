import { expect, test } from "@playwright/test";
import { clickNewProject } from "./helpers";

// Constants matching piano-roll.tsx
const BEAT_WIDTH = 80;
const ROW_HEIGHT = 20;

// Helper to seek playhead by clicking on timeline
async function seekTobeat(
  page: import("@playwright/test").Page,
  beat: number,
): Promise<void> {
  const timeline = page.getByTestId("timeline");
  const timelineBox = await timeline.boundingBox();
  if (!timelineBox) throw new Error("Timeline not found");

  // Click at the position corresponding to the beat
  // Timeline x = beat * BEAT_WIDTH (since scrollX starts at 0)
  const clickX = timelineBox.x + beat * BEAT_WIDTH;
  const clickY = timelineBox.y + timelineBox.height / 2;
  await page.mouse.click(clickX, clickY);

  // Wait for transport state to sync after seek
  await page.waitForTimeout(100);
}

test.describe("Copy/Paste", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("paste at playhead position", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note starting at beat 0 (click near left edge to snap to 0)
    const startX = gridBox.x + BEAT_WIDTH * 0.05;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();

    const notes = page.locator("[data-testid^='note-']");
    await expect(notes).toHaveCount(1);

    // Copy with Ctrl+C
    await page.keyboard.press("Control+c");

    // Move playhead to beat 2
    await seekTobeat(page, 2);

    // Paste with Ctrl+V - should paste at playhead (beat 2)
    await page.keyboard.press("Control+v");

    await expect(notes).toHaveCount(2);

    // Get note positions
    const note1Box = await notes.nth(0).boundingBox();
    const note2Box = await notes.nth(1).boundingBox();
    if (!note1Box || !note2Box) throw new Error("Notes not found");

    // Note 1 is at beat 0, Note 2 at beat 2 = 2 beats offset
    const expectedOffset = 2 * BEAT_WIDTH;
    expect(note2Box.x - note1Box.x).toBeCloseTo(expectedOffset, -1);

    // Same pitch (same y position)
    expect(Math.abs(note2Box.y - note1Box.y)).toBeLessThan(2);
  });

  test("paste snaps to grid", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note starting at beat 0
    const startX = gridBox.x + BEAT_WIDTH * 0.05;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();

    const notes = page.locator("[data-testid^='note-']");
    await expect(notes).toHaveCount(1);

    // Copy
    await page.keyboard.press("Control+c");

    // Move playhead to beat 1.5 (exactly on 1/8 grid)
    await seekTobeat(page, 1.5);

    // Paste
    await page.keyboard.press("Control+v");

    await expect(notes).toHaveCount(2);

    // Get note positions
    const note1Box = await notes.nth(0).boundingBox();
    const note2Box = await notes.nth(1).boundingBox();
    if (!note1Box || !note2Box) throw new Error("Notes not found");

    // Note1 at beat 0, playhead at 1.5 → note2 at beat 1.5
    const expectedOffset = 1.5 * BEAT_WIDTH;
    expect(note2Box.x - note1Box.x).toBeCloseTo(expectedOffset, -1);
  });

  test("copy and paste multiple notes preserves relative positions", async ({
    page,
  }) => {
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

    // Deselect
    await page.keyboard.press("Escape");

    // Create second note at beat 2, different pitch (2 rows down)
    const note2X = gridBox.x + BEAT_WIDTH * 2.5;
    const note2Y = gridBox.y + ROW_HEIGHT * 2.5;
    await page.mouse.move(note2X, note2Y);
    await page.mouse.down();
    await page.mouse.move(note2X + BEAT_WIDTH, note2Y);
    await page.mouse.up();
    await expect(notes).toHaveCount(2);

    // Deselect
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

    // Both notes should be selected
    await expect(notes.nth(0)).toHaveAttribute("data-selected", "true");
    await expect(notes.nth(1)).toHaveAttribute("data-selected", "true");

    // Get original positions
    const orig1 = await notes.nth(0).boundingBox();
    const orig2 = await notes.nth(1).boundingBox();
    if (!orig1 || !orig2) throw new Error("Original notes not found");
    const originalGap = orig2.x - orig1.x;

    // Copy
    await page.keyboard.press("Control+c");

    // Move playhead to beat 4 and paste
    await seekTobeat(page, 4);
    await page.keyboard.press("Control+v");

    await expect(notes).toHaveCount(4);

    // The 2 pasted notes should be selected
    await expect(notes.nth(0)).toHaveAttribute("data-selected", "false");
    await expect(notes.nth(1)).toHaveAttribute("data-selected", "false");
    await expect(notes.nth(2)).toHaveAttribute("data-selected", "true");
    await expect(notes.nth(3)).toHaveAttribute("data-selected", "true");

    // Pasted notes should have same relative gap
    const pasted1 = await notes.nth(2).boundingBox();
    const pasted2 = await notes.nth(3).boundingBox();
    if (!pasted1 || !pasted2) throw new Error("Pasted notes not found");
    const pastedGap = pasted2.x - pasted1.x;

    expect(Math.abs(pastedGap - originalGap)).toBeLessThan(2);
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

    // Copy, move playhead, and paste
    await page.keyboard.press("Control+c");
    await seekTobeat(page, 2);
    await page.keyboard.press("Control+v");
    await expect(notes).toHaveCount(2);

    // Undo paste
    await page.keyboard.press("Control+z");
    await expect(notes).toHaveCount(1);

    // Redo paste
    await page.keyboard.press("Control+y");
    await expect(notes).toHaveCount(2);
  });

  test("copy preserves note properties (duration, pitch)", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    const notes = page.locator("[data-testid^='note-']");

    // Create a note with specific duration (2 beats) at a specific pitch
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

    // Copy, move playhead, and paste
    await page.keyboard.press("Control+c");
    await seekTobeat(page, 4);
    await page.keyboard.press("Control+v");
    await expect(notes).toHaveCount(2);

    // Get pasted note dimensions
    const note2Box = await notes.nth(1).boundingBox();
    if (!note2Box) throw new Error("Pasted note not found");

    // Width (duration) should be the same
    expect(Math.abs(note2Box.width - note1Box.width)).toBeLessThan(2);
    // Height (pitch row height) should be the same
    expect(Math.abs(note2Box.height - note1Box.height)).toBeLessThan(2);
    // Y position (pitch) should be the same
    expect(Math.abs(note2Box.y - note1Box.y)).toBeLessThan(2);
  });

  test("paste at playhead 0 overlaps original note", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    const notes = page.locator("[data-testid^='note-']");

    // Create a note at beat 0 (click near left edge to snap to 0)
    const startX = gridBox.x + BEAT_WIDTH * 0.05;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();
    await expect(notes).toHaveCount(1);

    const note1Box = await notes.nth(0).boundingBox();
    if (!note1Box) throw new Error("Note not found");

    // Copy (playhead is at 0)
    await page.keyboard.press("Control+c");

    // Paste without moving playhead - should paste at beat 0 (overlapping)
    await page.keyboard.press("Control+v");
    await expect(notes).toHaveCount(2);

    const note2Box = await notes.nth(1).boundingBox();
    if (!note2Box) throw new Error("Pasted note not found");

    // Both notes should be at the same position (overlapping)
    expect(Math.abs(note2Box.x - note1Box.x)).toBeLessThan(2);
    expect(Math.abs(note2Box.y - note1Box.y)).toBeLessThan(2);
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

  test("pasted notes become selected", async ({ page }) => {
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

    const notes = page.locator("[data-testid^='note-']");
    await expect(notes).toHaveCount(1);

    // Copy
    await page.keyboard.press("Control+c");

    // Move playhead and paste
    await seekTobeat(page, 2);
    await page.keyboard.press("Control+v");

    await expect(notes).toHaveCount(2);

    // Original note should be deselected, pasted note should be selected
    await expect(notes.nth(0)).toHaveAttribute("data-selected", "false");
    await expect(notes.nth(1)).toHaveAttribute("data-selected", "true");
  });
});
