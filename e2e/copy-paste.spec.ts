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
  const clickX = timelineBox.x + beat * BEAT_WIDTH;
  const clickY = timelineBox.y + timelineBox.height / 2;

  // Double-click with jitter to ensure transport state syncs reliably
  await page.mouse.click(clickX, clickY);
  await page.waitForTimeout(50);
  await page.mouse.click(clickX + 1, clickY);
  await page.waitForTimeout(50);
}

test.describe("Copy/Paste", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("paste at playhead with grid snapping", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    const notes = page.locator("[data-testid^='note-']");

    // Create a note starting at beat 0
    const startX = gridBox.x + BEAT_WIDTH * 0.05;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();
    await expect(notes).toHaveCount(1);

    // Copy and paste at beat 2
    await page.keyboard.press("Control+c");
    await seekTobeat(page, 2);
    await page.keyboard.press("Control+v");
    await expect(notes).toHaveCount(2);

    // Verify offset of 2 beats
    const note1Box = await notes.nth(0).boundingBox();
    const note2Box = await notes.nth(1).boundingBox();
    if (!note1Box || !note2Box) throw new Error("Notes not found");
    expect(note2Box.x - note1Box.x).toBeCloseTo(2 * BEAT_WIDTH, -1);
    expect(Math.abs(note2Box.y - note1Box.y)).toBeLessThan(2);

    // Paste at beat 1.5 (should snap to 1/8 grid)
    await seekTobeat(page, 1.5);
    await page.keyboard.press("Control+v");
    await expect(notes).toHaveCount(3);

    const note3Box = await notes.nth(2).boundingBox();
    if (!note3Box) throw new Error("Third note not found");
    expect(note3Box.x - note1Box.x).toBeCloseTo(1.5 * BEAT_WIDTH, -1);
  });

  test("copy multiple notes preserves relative positions and properties", async ({
    page,
  }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    const notes = page.locator("[data-testid^='note-']");

    // Create first note at beat 0 with 2-beat duration
    const note1X = gridBox.x + BEAT_WIDTH * 0.5;
    const note1Y = gridBox.y + ROW_HEIGHT * 2.5;
    await page.mouse.move(note1X, note1Y);
    await page.mouse.down();
    await page.mouse.move(note1X + BEAT_WIDTH * 2, note1Y);
    await page.mouse.up();
    await expect(notes).toHaveCount(1);

    // Deselect
    await page.keyboard.press("Escape");

    // Create second note at beat 2, different pitch (2 rows down)
    const note2X = gridBox.x + BEAT_WIDTH * 2.5;
    const note2Y = gridBox.y + ROW_HEIGHT * 4.5;
    await page.mouse.move(note2X, note2Y);
    await page.mouse.down();
    await page.mouse.move(note2X + BEAT_WIDTH, note2Y);
    await page.mouse.up();
    await expect(notes).toHaveCount(2);
    await page.keyboard.press("Escape");

    // Box select both notes
    await page.keyboard.down("Shift");
    await page.mouse.move(gridBox.x + BEAT_WIDTH * 0.2, gridBox.y + ROW_HEIGHT);
    await page.mouse.down();
    await page.mouse.move(
      gridBox.x + BEAT_WIDTH * 4,
      gridBox.y + ROW_HEIGHT * 6,
    );
    await page.mouse.up();
    await page.keyboard.up("Shift");

    // Get original positions and dimensions
    const orig1 = await notes.nth(0).boundingBox();
    const orig2 = await notes.nth(1).boundingBox();
    if (!orig1 || !orig2) throw new Error("Original notes not found");
    const originalGap = orig2.x - orig1.x;

    // Copy, seek, and paste
    await page.keyboard.press("Control+c");
    await seekTobeat(page, 5);
    await page.keyboard.press("Control+v");
    await expect(notes).toHaveCount(4);

    // Pasted notes should preserve relative gap
    const pasted1 = await notes.nth(2).boundingBox();
    const pasted2 = await notes.nth(3).boundingBox();
    if (!pasted1 || !pasted2) throw new Error("Pasted notes not found");
    expect(Math.abs(pasted2.x - pasted1.x - originalGap)).toBeLessThan(2);

    // Width (duration) should be preserved
    expect(Math.abs(pasted1.width - orig1.width)).toBeLessThan(2);
    expect(Math.abs(pasted2.width - orig2.width)).toBeLessThan(2);

    // Height (row height) and pitch should be preserved
    expect(Math.abs(pasted1.height - orig1.height)).toBeLessThan(2);
    expect(Math.abs(pasted1.y - orig1.y)).toBeLessThan(2);
    expect(Math.abs(pasted2.y - orig2.y)).toBeLessThan(2);

    // Original notes should be deselected, pasted selected
    await expect(notes.nth(0)).toHaveAttribute("data-selected", "false");
    await expect(notes.nth(1)).toHaveAttribute("data-selected", "false");
    await expect(notes.nth(2)).toHaveAttribute("data-selected", "true");
    await expect(notes.nth(3)).toHaveAttribute("data-selected", "true");
  });

  test("paste behavior: overlap and empty selection", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    const notes = page.locator("[data-testid^='note-']");

    // Test 1: Copy with no selection does nothing
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await expect(notes).toHaveCount(0);

    // Create a note at beat 0
    const startX = gridBox.x + BEAT_WIDTH * 0.05;
    const startY = gridBox.y + ROW_HEIGHT * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + BEAT_WIDTH, startY);
    await page.mouse.up();
    await expect(notes).toHaveCount(1);

    const note1Box = await notes.nth(0).boundingBox();
    if (!note1Box) throw new Error("Note not found");

    // Test 2: Paste at playhead 0 overlaps original note
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v"); // Playhead at 0
    await expect(notes).toHaveCount(2);

    const note2Box = await notes.nth(1).boundingBox();
    if (!note2Box) throw new Error("Pasted note not found");
    expect(Math.abs(note2Box.x - note1Box.x)).toBeLessThan(2);
    expect(Math.abs(note2Box.y - note1Box.y)).toBeLessThan(2);

    // Test 3: Pasted note is selected, original is deselected
    await expect(notes.nth(0)).toHaveAttribute("data-selected", "false");
    await expect(notes.nth(1)).toHaveAttribute("data-selected", "true");
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
});
