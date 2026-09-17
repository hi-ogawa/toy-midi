import { expect, test } from "@playwright/test";
import { createRecorderProject } from "./recorder-helpers";

test("selects and deletes multiple MIDI notes", async ({ page }) => {
  // Create three notes and save the project before changing selection.
  await createRecorderProject(page);
  await page.getByTestId("recorder-add-midi-track").click();
  const row = page.getByTestId("recorder-midi-track-row");
  const grid = row.getByTestId("recorder-midi-grid");
  const notes = grid.locator("[data-note-id]");
  const gridBox = (await grid.boundingBox())!;
  const c4Key = row.getByRole("button", { name: "Preview C4", exact: true });
  const d4Key = row.getByRole("button", { name: "Preview D4", exact: true });
  const e4Key = row.getByRole("button", { name: "Preview E4", exact: true });
  const c4KeyBox = (await c4Key.boundingBox())!;

  await page.mouse.click(gridBox.x + 5, c4KeyBox.y + c4KeyBox.height / 2);
  const cellWidth = (await notes.first().boundingBox())!.width;
  const d4KeyBox = (await d4Key.boundingBox())!;
  await page.mouse.click(
    gridBox.x + cellWidth * 2 + 5,
    d4KeyBox.y + d4KeyBox.height / 2,
  );
  const e4KeyBox = (await e4Key.boundingBox())!;
  await page.mouse.click(
    gridBox.x + cellWidth * 4 + 5,
    e4KeyBox.y + e4KeyBox.height / 2,
  );
  await expect(notes).toHaveCount(3);
  const c4 = grid.locator('[aria-label="C4, beat 1"]');
  const d4 = grid.locator('[aria-label="D4, beat 1.5"]');
  const e4 = grid.locator('[aria-label="E4, beat 2"]');
  const save = page.getByTestId("recorder-save-button");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");

  // Ctrl/Cmd-click toggles notes without changing the project.
  await c4.click({ modifiers: ["Control"] });
  await expect(c4).toHaveAttribute("data-selected", "true");
  await expect(e4).toHaveAttribute("data-selected", "false");
  await e4.click({ modifiers: ["Control"] });
  await expect(e4).toHaveAttribute("data-selected", "true");
  await e4.click({ modifiers: ["Control"] });
  await expect(e4).toHaveAttribute("data-selected", "false");
  await expect(save).toHaveAttribute("data-status", "saved");

  // An ordinary click replaces the current selection.
  await d4.click();
  await expect(c4).toHaveAttribute("data-selected", "false");
  await expect(d4).toHaveAttribute("data-selected", "true");

  // Cancel a box selection with Escape and keep it cancelled through release.
  const cancelC4Box = (await c4.boundingBox())!;
  const cancelD4Box = (await d4.boundingBox())!;
  await page.keyboard.down("Shift");
  await page.mouse.move(
    cancelD4Box.x + cancelD4Box.width * 1.5,
    cancelD4Box.y + cancelD4Box.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    cancelC4Box.x + 1,
    cancelC4Box.y + cancelC4Box.height / 2,
    {
      steps: 4,
    },
  );
  await expect(grid.getByTestId("recorder-midi-box-selection")).toBeVisible();
  await page.keyboard.up("Shift");
  await page.keyboard.press("Escape");
  await expect(grid.getByTestId("recorder-midi-box-selection")).toHaveCount(0);
  await page.mouse.move(
    cancelC4Box.x + 2,
    cancelC4Box.y + cancelC4Box.height / 2,
  );
  await page.mouse.up();
  await expect(grid.getByTestId("recorder-midi-box-selection")).toHaveCount(0);
  await expect(grid.locator("[data-note-id][data-selected=true]")).toHaveCount(
    0,
  );
  await expect(notes).toHaveCount(3);
  await expect(save).toHaveAttribute("data-status", "saved");

  // Shift-drag from empty space selects overlapping notes without creating one.
  const c4Box = (await c4.boundingBox())!;
  const d4Box = (await d4.boundingBox())!;
  await page.keyboard.down("Shift");
  await page.mouse.move(
    d4Box.x + d4Box.width * 1.5,
    d4Box.y + d4Box.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(c4Box.x + 1, c4Box.y + c4Box.height / 2, {
    steps: 4,
  });
  const boxPreview = grid.getByTestId("recorder-midi-box-selection");
  const startY = d4Box.y + d4Box.height / 2;
  const endY = c4Box.y + c4Box.height / 2;
  await expect(boxPreview).toBeVisible();
  await expect
    .poll(async () => (await boxPreview.boundingBox())?.y)
    .toBeCloseTo(startY, 0);
  await expect
    .poll(async () => (await boxPreview.boundingBox())?.height)
    .toBeCloseTo(endY - startY, 0);

  // Move within the same pitch row and keep the rectangle aligned with the pointer.
  await page.mouse.move(c4Box.x + 1, endY + 3);
  await expect
    .poll(async () => (await boxPreview.boundingBox())?.height)
    .toBeCloseTo(endY + 3 - startY, 0);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(notes).toHaveCount(3);
  await expect(c4).toHaveAttribute("data-selected", "true");
  await expect(d4).toHaveAttribute("data-selected", "true");
  await expect(e4).toHaveAttribute("data-selected", "false");
  await expect(save).toHaveAttribute("data-status", "saved");

  // Delete commits the selected set together.
  await page.keyboard.press("Delete");
  await expect(notes).toHaveCount(1);
  await expect(e4).toBeVisible();
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.reload();
  await expect(notes).toHaveCount(1);
  await expect(e4).toBeVisible();
});
