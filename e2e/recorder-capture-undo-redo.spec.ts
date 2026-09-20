import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import { useFakeAudioInput } from "./helpers";
import {
  createRecorderProject,
  enableInput,
  seekRecorderByPixels,
  waitForRecordingSamples,
} from "./recorder-helpers";

useFakeAudioInput();

test("undoes capture during a drag without committing the stale preview", async ({
  page,
}) => {
  // Record a waveform-backed take away from the timeline origin.
  await createRecorderProject(page);
  await enableInput(page);
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 2);
  const record = page.getByTestId("recorder-record-button");
  await record.click();
  await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));
  await record.click();
  const take = page.getByTestId("recorder-clip-comp-source");
  const comp = page.getByTestId("recorder-clip-comp");
  await expect(take).toBeVisible();
  await expect(comp.locator("svg")).toBeVisible();
  const original = (await take.boundingBox())!;

  // Preview a move, then undo capture before releasing the pointer.
  const x = original.x + original.width / 2;
  const y = original.y + original.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + DEFAULT_PIXELS_PER_BEAT, y, { steps: 4 });
  await expect
    .poll(async () => (await take.boundingBox())!.x)
    .toBeCloseTo(original.x + DEFAULT_PIXELS_PER_BEAT, -1);
  await page.keyboard.press("Control+z");
  await expect(take).toHaveCount(0);
  await page.mouse.up();
  await expect(take).toHaveCount(0);
  await expect(comp).toHaveCount(0);

  // Redo restores the original take geometry and waveform, without the preview move.
  await page.keyboard.press("Control+Shift+z");
  await expect(take).toHaveCount(1);
  await expect(comp).toContainText("Take 1");
  await expect(comp.locator("svg")).toBeVisible();
  const restored = (await take.boundingBox())!;
  expect(restored.x).toBeCloseTo(original.x, -1);
  expect(restored.width).toBeCloseTo(original.width, -1);
});
