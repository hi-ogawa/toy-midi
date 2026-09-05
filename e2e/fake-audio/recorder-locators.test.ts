import { expect, test } from "@playwright/test";
import { createCheckpoint } from "../helpers";
import {
  createRecorderProject,
  dragBy,
  getRecorderBeat,
  seekRecorderByPixels,
} from "./recorder-helpers";

test("edits, seeks, and selects recorder locators", async ({ page }) => {
  const checkpoint = createCheckpoint();
  await createRecorderProject(page);
  const pixelsPerBeat = 80;
  const add = page.getByRole("button", { name: "Add locator at playhead" });
  const first = page.getByRole("button", { name: "Section 1", exact: true });
  const second = page.getByRole("button", { name: "Section 2", exact: true });
  const verse = page.getByRole("button", { name: "Verse", exact: true });

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

  // Rename commits through the prompt; cancelling keeps the existing label.
  page.once("dialog", (dialog) => dialog.accept("Verse"));
  await first.dblclick();
  await expect(verse).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await verse.dblclick();
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
  checkpoint("create, rename, deselect, and drag");
});

test("persists recorder locator edits and deletion", async ({ page }) => {
  await createRecorderProject(page);
  const first = page.getByRole("button", { name: "Section 1", exact: true });
  const verse = page.getByRole("button", { name: "Verse", exact: true });
  const lane = page.getByTestId("recorder-locator-lane");
  const unsavedProjectButton = page.getByRole("button", {
    name: /Unsaved changes/,
  });
  const savedProjectButton = page.getByRole("button", {
    name: "All changes saved",
  });

  await seekRecorderByPixels(page, 80 * 2.5);
  await page.keyboard.press("l");
  await expect(unsavedProjectButton).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept("Verse"));
  await first.dblclick();

  // Save restores the edited label and beat, but not the selection.
  await verse.click();
  await unsavedProjectButton.click();
  await expect(savedProjectButton).toHaveAttribute("aria-disabled", "true");
  await page.reload();
  await expect(verse).toHaveAttribute("aria-pressed", "false");
  await verse.click();
  await expect.poll(() => getRecorderBeat(page)).toBe(2.5);
  await expect(savedProjectButton).toHaveAttribute("aria-disabled", "true");

  // Musical position survives tempo changes; each locator edit dirties the save.
  await page.getByTestId("recorder-tempo-input").fill("90");
  await page.getByTestId("recorder-tempo-input").press("Enter");
  await verse.click();
  await expect.poll(() => getRecorderBeat(page)).toBe(2.5);
  await unsavedProjectButton.click();
  await expect(savedProjectButton).toHaveAttribute("aria-disabled", "true");
  page.once("dialog", (dialog) => dialog.accept("Chorus"));
  await verse.dblclick();
  const chorus = page.getByRole("button", { name: "Chorus", exact: true });
  await expect(unsavedProjectButton).toBeEnabled();
  await unsavedProjectButton.click();
  await expect(savedProjectButton).toHaveAttribute("aria-disabled", "true");
  await dragBy(page, chorus, 40);
  await expect(unsavedProjectButton).toBeEnabled();
  await unsavedProjectButton.click();
  await expect(savedProjectButton).toHaveAttribute("aria-disabled", "true");
  await page.reload();
  await expect(chorus).toHaveAttribute("aria-pressed", "false");
  await chorus.click();
  await expect.poll(() => getRecorderBeat(page)).toBe(3);
  await page.keyboard.press("Delete");
  await expect(chorus).toHaveCount(0);
  await expect(unsavedProjectButton).toBeEnabled();
  await unsavedProjectButton.click();
  await expect(savedProjectButton).toHaveAttribute("aria-disabled", "true");
  await page.reload();
  await expect(page.getByTestId("recorder-project-name")).toBeVisible();
  await expect(chorus).toHaveCount(0);
  await expect(lane.getByRole("button")).toHaveCount(0);
});
