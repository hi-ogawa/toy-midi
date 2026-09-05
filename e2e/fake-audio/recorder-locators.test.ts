import { expect, test } from "@playwright/test";
import { createCheckpoint } from "../helpers";
import {
  createRecorderProject,
  dragBy,
  getRecorderBeat,
  seekRecorderByPixels,
} from "./recorder-helpers";

test("edits, seeks, selects, and persists recorder locators", async ({
  page,
}) => {
  const checkpoint = createCheckpoint();
  await createRecorderProject(page);
  const pixelsPerBeat = 80;
  const add = page.getByRole("button", { name: "Add locator at playhead" });
  const first = page.getByRole("button", { name: "Section 1", exact: true });
  const second = page.getByRole("button", { name: "Section 2", exact: true });
  const verse = page.getByRole("button", { name: "Verse", exact: true });
  const unsaved = page.getByRole("button", { name: /Unsaved changes/ });
  const saved = page.getByRole("button", { name: "All changes saved" });

  // Both creation controls use the snapped playhead and select the new marker.
  await seekRecorderByPixels(page, pixelsPerBeat * 0.9);
  await page.keyboard.press("l");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(unsaved).toBeEnabled();
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
  await lane.click({ position: { x: laneBox!.width - 10, y: 12 } });
  await expect(verse).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => getRecorderBeat(page)).toBe(1);

  // Dragging snaps the marker to beat 2.5 without moving the playhead.
  await seekRecorderByPixels(page, pixelsPerBeat * 6);
  await dragBy(page, verse, 110);
  await expect(verse).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => getRecorderBeat(page)).toBe(6);
  await verse.click();
  await expect.poll(() => getRecorderBeat(page)).toBe(2.5);
  checkpoint("create, rename, deselect, and drag");

  // During playback, pointer-down must not seek before the completed click.
  await seekRecorderByPixels(page, pixelsPerBeat * 6);
  const play = page.getByTestId("recorder-play-button");
  await play.click();
  await expect.poll(() => getRecorderBeat(page)).toBeGreaterThan(6.5);
  const verseBox = await verse.boundingBox();
  expect(verseBox).not.toBeNull();
  await page.mouse.move(
    verseBox!.x + verseBox!.width / 2,
    verseBox!.y + verseBox!.height / 2,
  );
  const beforePress = await getRecorderBeat(page);
  await page.mouse.down();
  expect(await getRecorderBeat(page)).toBeGreaterThanOrEqual(beforePress);
  await expect
    .poll(() => getRecorderBeat(page))
    .toBeGreaterThan(beforePress + 0.5);
  await page.mouse.up();
  await expect.poll(() => getRecorderBeat(page)).toBeLessThan(4);
  await play.click();
  checkpoint("single seek during playback");

  // Save restores the edited label and beat, but not the selection.
  await verse.click();
  await unsaved.click();
  await expect(saved).toHaveAttribute("aria-disabled", "true");
  await page.reload();
  await expect(verse).toHaveAttribute("aria-pressed", "false");
  await verse.click();
  await expect.poll(() => getRecorderBeat(page)).toBe(2.5);
  await expect(saved).toHaveAttribute("aria-disabled", "true");

  // Musical position survives tempo changes; each locator edit dirties the save.
  await page.getByTestId("recorder-tempo-input").fill("90");
  await page.getByTestId("recorder-tempo-input").press("Enter");
  await verse.click();
  await expect.poll(() => getRecorderBeat(page)).toBe(2.5);
  await unsaved.click();
  await expect(saved).toHaveAttribute("aria-disabled", "true");
  page.once("dialog", (dialog) => dialog.accept("Chorus"));
  await verse.dblclick();
  const chorus = page.getByRole("button", { name: "Chorus", exact: true });
  await expect(unsaved).toBeEnabled();
  await unsaved.click();
  await expect(saved).toHaveAttribute("aria-disabled", "true");
  await dragBy(page, chorus, 40);
  await expect(unsaved).toBeEnabled();
  await unsaved.click();
  await expect(saved).toHaveAttribute("aria-disabled", "true");
  await page.reload();
  await expect(chorus).toHaveAttribute("aria-pressed", "false");
  await chorus.click();
  await expect.poll(() => getRecorderBeat(page)).toBe(3);
  await page.keyboard.press("Delete");
  await expect(chorus).toHaveCount(0);
  await expect(unsaved).toBeEnabled();
  await unsaved.click();
  await expect(saved).toHaveAttribute("aria-disabled", "true");
  await page.reload();
  await expect(page.getByTestId("recorder-project-name")).toBeVisible();
  await expect(chorus).toHaveCount(0);
  await expect(lane.getByRole("button")).toHaveCount(0);
  checkpoint("save and reload");
});
