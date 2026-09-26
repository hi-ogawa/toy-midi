import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import {
  addRecorderAudio,
  createRecorderProject,
  dragBy,
  saveRecorderProject,
} from "./recorder-helpers";

test("adds a clip while trimming and previews shared limits on both edges", async ({
  page,
}) => {
  // Load two clips and give the second less visible audio and more room to extend.
  await createRecorderProject(page);
  await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");
  await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");
  const clips = page.getByTestId("recorder-clip-audio-source");
  const first = clips.nth(0);
  const second = clips.nth(1);
  const originalBox = (await first.boundingBox())!;
  const trimPixels = DEFAULT_PIXELS_PER_BEAT;
  await dragBy(page, first.getByTestId("recorder-clip-trim-start"), trimPixels);
  await dragBy(page, first.getByTestId("recorder-clip-trim-end"), -trimPixels);
  await dragBy(
    page,
    second.getByTestId("recorder-clip-trim-start"),
    trimPixels * 2,
  );
  await dragBy(
    page,
    second.getByTestId("recorder-clip-trim-end"),
    -trimPixels * 2,
  );
  await saveRecorderProject(page);
  const save = page.getByTestId("recorder-save-button");
  const firstBeforeBox = (await first.boundingBox())!;
  const secondBeforeBox = (await second.boundingBox())!;

  // Select only the first, then Ctrl-trim the second to add it to the group.
  await page.keyboard.press("Escape");
  await first.click();
  await expect(second).not.toHaveAttribute("data-selected", "true");
  await page.keyboard.down("Control");
  await dragBy(
    page,
    second.getByTestId("recorder-clip-trim-start"),
    -trimPixels * 3,
    { release: false },
  );
  await page.keyboard.up("Control");
  await expect(first).toHaveAttribute("data-selected", "true");
  await expect(second).toHaveAttribute("data-selected", "true");

  // Clamp both start edges by the first clip's limit without changing saved state.
  const firstStartTrimBox = (await first.boundingBox())!;
  const secondStartTrimBox = (await second.boundingBox())!;
  expect(firstStartTrimBox.x).toBeCloseTo(originalBox.x, 0);
  expect(secondStartTrimBox.x).toBeCloseTo(secondBeforeBox.x - trimPixels, 0);
  expect(firstStartTrimBox.width).toBeCloseTo(
    firstBeforeBox.width + trimPixels,
    0,
  );
  expect(secondStartTrimBox.width).toBeCloseTo(
    secondBeforeBox.width + trimPixels,
    0,
  );
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.mouse.up();
  expect((await first.boundingBox())!.x).toBeCloseTo(firstStartTrimBox.x, 0);
  expect((await second.boundingBox())!.x).toBeCloseTo(secondStartTrimBox.x, 0);
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await saveRecorderProject(page);

  // Extend both end edges without a modifier and clamp at the first clip's source end.
  await dragBy(
    page,
    second.getByTestId("recorder-clip-trim-end"),
    trimPixels * 3,
    {
      release: false,
    },
  );
  const firstEndTrimBox = (await first.boundingBox())!;
  const secondEndTrimBox = (await second.boundingBox())!;
  expect(firstEndTrimBox.x).toBeCloseTo(firstStartTrimBox.x, 0);
  expect(secondEndTrimBox.x).toBeCloseTo(secondStartTrimBox.x, 0);
  expect(firstEndTrimBox.width).toBeCloseTo(originalBox.width, 0);
  expect(secondEndTrimBox.width).toBeCloseTo(
    secondStartTrimBox.width + trimPixels,
    0,
  );
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.mouse.up();
  expect((await first.boundingBox())!.width).toBeCloseTo(
    firstEndTrimBox.width,
    0,
  );
  expect((await second.boundingBox())!.width).toBeCloseTo(
    secondEndTrimBox.width,
    0,
  );
  await expect(save).toHaveAttribute("data-status", "unsaved");

  // Save and reload to retain both clips' final trimmed bounds.
  await saveRecorderProject(page);
  await page.reload();
  await expect(clips).toHaveCount(2);
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  expect((await first.boundingBox())!.x).toBeCloseTo(firstEndTrimBox.x, 0);
  expect((await first.boundingBox())!.width).toBeCloseTo(
    firstEndTrimBox.width,
    0,
  );
  expect((await second.boundingBox())!.x).toBeCloseTo(secondEndTrimBox.x, 0);
  expect((await second.boundingBox())!.width).toBeCloseTo(
    secondEndTrimBox.width,
    0,
  );
});
