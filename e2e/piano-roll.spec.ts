import { expect, test } from "@playwright/test";

// Constants matching piano-roll.tsx
const BEAT_WIDTH = 80;
const ROW_HEIGHT = 20;
const MAX_PITCH = 55; // G3

function pitchToY(pitch: number): number {
  return (MAX_PITCH - pitch) * ROW_HEIGHT;
}

test.describe("Piano Roll", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders grid and keyboard", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    await expect(grid).toBeVisible();

    // Check keyboard labels are visible
    await expect(page.getByText("G3")).toBeVisible();
    await expect(page.getByText("E1")).toBeVisible();
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

    const note = page.locator("[data-testid^='note-']");
    const initialRect = note.locator("rect").first();
    const initialX = await initialRect.getAttribute("x");

    // Drag note to beat 2
    const noteCenter = startX + BEAT_WIDTH * 0.25;
    await page.mouse.move(noteCenter, startY);
    await page.mouse.down();
    await page.mouse.move(noteCenter + BEAT_WIDTH * 2, startY);
    await page.mouse.up();

    // Note should have moved
    const finalX = await initialRect.getAttribute("x");
    expect(Number(finalX)).toBeGreaterThan(Number(initialX));
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
});
