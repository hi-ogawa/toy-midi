import { expect, test } from "@playwright/test";
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
  const original = (await first.boundingBox())!;
  const inset = original.width / 8;
  await dragBy(page, first.getByTestId("recorder-take-trim-start"), inset);
  await dragBy(page, first.getByTestId("recorder-take-trim-end"), -inset);
  await dragBy(page, second.getByTestId("recorder-take-trim-start"), inset * 2);
  await dragBy(page, second.getByTestId("recorder-take-trim-end"), -inset * 2);
  await saveRecorderProject(page);
  const save = page.getByTestId("recorder-save-button");
  const firstBefore = (await first.boundingBox())!;
  const secondBefore = (await second.boundingBox())!;

  // Select only the first, then Ctrl-trim the second to add it to the group.
  await page.keyboard.press("Escape");
  await first.click();
  await expect(second).not.toHaveAttribute("data-selected", "true");
  await page.keyboard.down("Control");
  await dragBy(
    page,
    second.getByTestId("recorder-take-trim-start"),
    -inset * 3,
    { release: false },
  );
  await page.keyboard.up("Control");
  await expect(first).toHaveAttribute("data-selected", "true");
  await expect(second).toHaveAttribute("data-selected", "true");

  // Clamp both start edges by the first clip's limit without changing saved state.
  const firstStartPreview = (await first.boundingBox())!;
  const secondStartPreview = (await second.boundingBox())!;
  expect(firstStartPreview.x).toBeCloseTo(original.x, 0);
  expect(secondStartPreview.x).toBeCloseTo(secondBefore.x - inset, 0);
  expect(firstStartPreview.width).toBeCloseTo(firstBefore.width + inset, 0);
  expect(secondStartPreview.width).toBeCloseTo(secondBefore.width + inset, 0);
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.mouse.up();
  expect((await first.boundingBox())!.x).toBeCloseTo(firstStartPreview.x, 0);
  expect((await second.boundingBox())!.x).toBeCloseTo(secondStartPreview.x, 0);
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await saveRecorderProject(page);

  // Extend both end edges without a modifier and clamp at the first clip's source end.
  await dragBy(page, second.getByTestId("recorder-take-trim-end"), inset * 3, {
    release: false,
  });
  const firstEndPreview = (await first.boundingBox())!;
  const secondEndPreview = (await second.boundingBox())!;
  expect(firstEndPreview.x).toBeCloseTo(firstStartPreview.x, 0);
  expect(secondEndPreview.x).toBeCloseTo(secondStartPreview.x, 0);
  expect(firstEndPreview.width).toBeCloseTo(original.width, 0);
  expect(secondEndPreview.width).toBeCloseTo(
    secondStartPreview.width + inset,
    0,
  );
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.mouse.up();
  expect((await first.boundingBox())!.width).toBeCloseTo(
    firstEndPreview.width,
    0,
  );
  expect((await second.boundingBox())!.width).toBeCloseTo(
    secondEndPreview.width,
    0,
  );
  await expect(save).toHaveAttribute("data-status", "unsaved");

  // Save and reload to retain both clips' final trimmed bounds.
  await saveRecorderProject(page);
  await page.reload();
  await expect(clips).toHaveCount(2);
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  expect((await first.boundingBox())!.x).toBeCloseTo(firstEndPreview.x, 0);
  expect((await first.boundingBox())!.width).toBeCloseTo(
    firstEndPreview.width,
    0,
  );
  expect((await second.boundingBox())!.x).toBeCloseTo(secondEndPreview.x, 0);
  expect((await second.boundingBox())!.width).toBeCloseTo(
    secondEndPreview.width,
    0,
  );
});
