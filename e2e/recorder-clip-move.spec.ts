import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import {
  addRecorderAudio,
  createRecorderProject,
  dragBy,
  saveRecorderProject,
} from "./recorder-helpers";

test("previews a clip move, cancels through release, and persists a committed move", async ({
  page,
}) => {
  // Load and save audio so the save indicator distinguishes preview from commit.
  await createRecorderProject(page);
  await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");
  await saveRecorderProject(page);
  const clip = page.getByTestId("recorder-clip-audio-source");
  const save = page.getByTestId("recorder-save-button");
  const original = (await clip.boundingBox())!;
  const delta = DEFAULT_PIXELS_PER_BEAT;

  // Hold a move and show the preview while the project remains saved.
  const pointer = await dragBy(page, clip, delta, { release: false });
  expect((await clip.boundingBox())!.x).toBeCloseTo(original.x + delta, 0);
  await expect(save).toHaveAttribute("data-status", "saved");

  // Cancel, then continue dragging and release without resurrecting the edit.
  await page.keyboard.press("Escape");
  expect((await clip.boundingBox())!.x).toBeCloseTo(original.x, 0);
  await page.mouse.move(pointer.x + delta * 2, pointer.y, { steps: 4 });
  await page.mouse.up();
  expect((await clip.boundingBox())!.x).toBeCloseTo(original.x, 0);
  await expect(save).toHaveAttribute("data-status", "saved");

  // Release a fresh move and commit exactly the previewed position.
  await dragBy(page, clip, delta, { release: false });
  const preview = (await clip.boundingBox())!;
  expect(preview.x).toBeCloseTo(original.x + delta, 0);
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.mouse.up();
  expect((await clip.boundingBox())!.x).toBeCloseTo(preview.x, 0);
  await expect(save).toHaveAttribute("data-status", "unsaved");

  // Save and reload to retain the committed position and duration.
  await saveRecorderProject(page);
  await page.reload();
  await expect(clip).toBeVisible();
  expect((await clip.boundingBox())!.x).toBeCloseTo(preview.x, 0);
  expect((await clip.boundingBox())!.width).toBeCloseTo(original.width, 0);
});
