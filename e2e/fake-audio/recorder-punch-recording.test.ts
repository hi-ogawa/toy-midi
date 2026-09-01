import assert from "node:assert/strict";
import { expect, test } from "@playwright/test";
import {
  createRecorderProject,
  dragBy,
  enableInput,
  seekRecorderByPixels,
  waitForRecordingSamples,
} from "./recorder-helpers";

test("records only the punched interval into the comp", async ({ page }) => {
  await createRecorderProject(page);
  await enableInput(page);

  const recordButton = page.getByTestId("recorder-record-button");
  const take = page.getByTestId("recorder-clip-take");
  const comp = page.getByTestId("recorder-clip-comp");

  // Create a punch range strictly inside the recording span.
  await page.getByTestId("recorder-punch-toggle").click();
  const punchRange = page.getByTestId("recorder-punch-range");
  await expect(punchRange).toBeVisible();
  await dragBy(page, page.getByTestId("recorder-punch-start"), 40);
  await dragBy(page, page.getByTestId("recorder-punch-end"), -40);
  const punchBox = await punchRange.boundingBox();
  assert(punchBox);

  // Capture surrounding audio, while only its overlap with Punch joins Capture.
  await seekRecorderByPixels(page, 0);
  await recordButton.click();
  const recording = page.getByTestId("recorder-clip-recording");
  await waitForRecordingSamples(recording);
  await expect
    .poll(() =>
      recording.evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBeGreaterThanOrEqual(punchBox.width);
  await recordButton.click();
  await expect(take).toHaveCount(1);
  await expect(comp).toHaveCount(1);

  const takeBox = await take.boundingBox();
  const compBox = await comp.boundingBox();
  assert(takeBox);
  assert(compBox);
  expect(takeBox.x).toBeCloseTo(punchBox.x, -1);
  expect(takeBox.width).toBeCloseTo(punchBox.width, -1);
  expect(compBox.x).toBeCloseTo(punchBox.x, -1);
  expect(compBox.width).toBeCloseTo(punchBox.width, -1);
});
