import { expect, test } from "@playwright/test";
import {
  createRecorderProject,
  dragBy,
  getRecorderBeat,
  seekRecorderByPixels,
} from "./recorder-helpers";

const pixelsPerBeat = 80;

test("edits, seeks, and selects recorder locators", async ({ page }) => {
  await createRecorderProject(page);
  const add = page.getByRole("button", { name: "Add locator at playhead" });
  const first = page.getByRole("button", { name: "Section 1", exact: true });
  const renameFirst = page.getByRole("button", { name: "Rename Section 1" });
  const second = page.getByRole("button", { name: "Section 2", exact: true });
  const verse = page.getByRole("button", { name: "Verse", exact: true });
  const renameVerse = page.getByRole("button", { name: "Rename Verse" });

  // Both creation controls use the snapped playhead and select the new marker.
  await seekRecorderByPixels(page, pixelsPerBeat * 0.9);
  await page.keyboard.press("l");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await seekRecorderByPixels(page, pixelsPerBeat * 4);
  await add.click();
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await first.click();
  await expect.poll(() => getRecorderBeat(page)).toBe(1);

  // Rename commits without seeking; cancelling keeps the existing label.
  await seekRecorderByPixels(page, pixelsPerBeat * 3);
  page.once("dialog", (dialog) => dialog.accept("Verse"));
  // Playwright can click the opacity-hidden rename action, avoiding hover setup here.
  await renameFirst.click();
  await expect(verse).toBeVisible();
  await expect.poll(() => getRecorderBeat(page)).toBe(3);
  page.once("dialog", (dialog) => dialog.dismiss());
  await renameVerse.click();
  await expect(verse).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(verse).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Delete");
  await expect(verse).toBeVisible();

  // Removing the selected locator leaves the other marker intact.
  await second.click();
  await page.keyboard.press("Backspace");
  await expect(second).toHaveCount(0);
  await expect(verse).toBeVisible();

  // Empty locator space deselects without seeking.
  await verse.click();
  const lane = page.getByTestId("recorder-locator-lane");
  const laneBox = await lane.boundingBox();
  expect(laneBox).not.toBeNull();
  await lane.click({
    position: { x: laneBox!.width - 10, y: laneBox!.height / 2 },
  });
  await expect(verse).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => getRecorderBeat(page)).toBe(1);

  // Dragging snaps the marker to beat 2.5 without moving the playhead.
  await seekRecorderByPixels(page, pixelsPerBeat * 6);
  const beforeDrag = await verse.boundingBox();
  expect(beforeDrag).not.toBeNull();
  await dragBy(page, verse, 110);
  await expect
    .poll(async () => (await verse.boundingBox())?.x)
    .toBeCloseTo(beforeDrag!.x + pixelsPerBeat * 1.5, 1);
  await expect(verse).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => getRecorderBeat(page)).toBe(6);
  await verse.click();
  await expect.poll(() => getRecorderBeat(page)).toBe(2.5);

  // Locator beats remain stable when tempo changes.
  await page.getByTestId("recorder-tempo-input").fill("90");
  await page.getByTestId("recorder-tempo-input").press("Enter");
  await seekRecorderByPixels(page, pixelsPerBeat * 4);
  await expect.poll(() => getRecorderBeat(page)).toBe(4);
  await verse.click();
  await expect.poll(() => getRecorderBeat(page)).toBe(2.5);
});

test("persists recorder locator edits and deletion", async ({ page }) => {
  await createRecorderProject(page);
  const first = page.getByRole("button", { name: "Section 1", exact: true });
  const firstRenamed = page.getByRole("button", {
    name: "Renamed 1",
    exact: true,
  });
  const renameFirst = page.getByRole("button", { name: "Rename Section 1" });
  const second = page.getByRole("button", { name: "Section 2", exact: true });
  const lane = page.getByTestId("recorder-locator-lane");
  const saveButton = page.getByTestId("recorder-save-button");

  // Create locators at beats 2.5 and 5.
  await seekRecorderByPixels(page, pixelsPerBeat * 2.5);
  await page.keyboard.press("l");
  await seekRecorderByPixels(page, pixelsPerBeat * 5);
  await page.keyboard.press("l");
  await expect(saveButton).toHaveAttribute("data-status", "unsaved");

  // Save restores the locator beat, but not the selection.
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await saveButton.click();
  await expect(saveButton).toHaveAttribute("data-status", "saved");
  await page.reload();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await first.click();
  await expect.poll(() => getRecorderBeat(page)).toBe(2.5);
  await expect(saveButton).toHaveAttribute("data-status", "saved");

  // Renaming dirties the project.
  page.once("dialog", (dialog) => dialog.accept("Renamed 1"));
  await renameFirst.click();
  await expect(saveButton).toHaveAttribute("data-status", "unsaved");
  await saveButton.click();
  await expect(saveButton).toHaveAttribute("data-status", "saved");

  // Moving a locator dirties the project and persists its new beat.
  await dragBy(page, firstRenamed, pixelsPerBeat * 0.5);
  await expect(saveButton).toHaveAttribute("data-status", "unsaved");
  await saveButton.click();
  await expect(saveButton).toHaveAttribute("data-status", "saved");
  await page.reload();
  await expect(firstRenamed).toHaveAttribute("aria-pressed", "false");
  await firstRenamed.click();
  await expect.poll(() => getRecorderBeat(page)).toBe(3);

  // Deleting a locator dirties the project and persists its removal.
  await page.keyboard.press("Delete");
  await expect(firstRenamed).toHaveCount(0);
  await expect(saveButton).toHaveAttribute("data-status", "unsaved");
  await saveButton.click();
  await expect(saveButton).toHaveAttribute("data-status", "saved");
  await page.reload();
  await expect(firstRenamed).toHaveCount(0);
  await expect(second).toBeVisible();
  await expect(lane.getByTestId("recorder-locator")).toHaveCount(1);
});
