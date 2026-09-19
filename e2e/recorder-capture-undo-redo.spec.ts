import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import { useFakeAudioInput } from "./helpers";
import {
  addRecorderMidiTrack,
  createRecorderMidiNote,
  createRecorderProject,
  enableInput,
  getRecorderPosition,
  seekRecorderByPixels,
  waitForRecordingSamples,
} from "./recorder-helpers";

useFakeAudioInput();

test("undoes recorded takes and MIDI edits together and restores overlapping audio", async ({
  page,
}) => {
  // Record a first take long enough to contain a later overlapping take.
  await createRecorderProject(page);
  const midi = await addRecorderMidiTrack(page);
  await enableInput(page);
  const record = page.getByTestId("recorder-record-button");
  const takes = page.getByTestId("recorder-take-row");
  const comp = page.getByTestId("recorder-clip-comp");
  await seekRecorderByPixels(page, 0);
  await record.click();
  await expect.poll(() => getRecorderPosition(page)).toBeGreaterThan(1.8);
  await record.click();
  await page.getByTestId("recorder-takes-toggle").click();
  await expect(takes).toHaveCount(1);
  await expect(comp).toHaveCount(1);
  const originalComp = (await comp.boundingBox())!;

  // Add a MIDI note between takes so undo must follow their shared chronology.
  const note = await createRecorderMidiNote(page, midi, {
    beat: 0.5,
    pitch: "C4",
  });
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 0.5);
  await record.click();
  await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));
  await page.keyboard.press("Control+z");
  await expect(note).toBeVisible();
  await expect(record).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => getRecorderPosition(page)).toBeGreaterThan(1.2);
  await record.click();
  await expect(takes).toHaveCount(2);
  const second = takes
    .filter({ hasText: "Take 2" })
    .getByTestId("recorder-clip-take-lane");
  const secondBox = (await second.boundingBox())!;
  await expect(comp.filter({ hasText: "Take 2" })).toBeVisible();

  // Undo the second take and reveal the first take across its original full span.
  await takes
    .filter({ hasText: "Take 2" })
    .getByTestId("recorder-clip-take-lane-source")
    .click();
  await page.keyboard.press("Control+z");
  await expect(takes).toHaveCount(1);
  await expect(comp).toHaveCount(1);
  await expect(comp).toContainText("Take 1");
  await expect(comp.locator("svg")).toBeVisible();
  expect((await comp.boundingBox())!.width).toBeCloseTo(originalComp.width, 0);
  await expect(note).toBeVisible();

  // Undo the intervening MIDI edit and first take without removing the MIDI track.
  await page.keyboard.press("Control+z");
  await expect(note).toHaveCount(0);
  await expect(takes).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(takes).toHaveCount(0);
  await expect(comp).toHaveCount(0);
  await expect(midi).toBeVisible();

  // Redo both takes and the MIDI edit with their original waveforms and placement.
  await page.keyboard.press("Control+Shift+z");
  await expect(comp).toContainText("Take 1");
  await page.keyboard.press("Control+Shift+z");
  await expect(note).toBeVisible();
  await page.keyboard.press("Control+Shift+z");
  await expect(takes).toHaveCount(2);
  await expect(second.locator("svg")).toBeVisible();
  const restoredBox = (await second.boundingBox())!;
  expect(restoredBox.x).toBeCloseTo(secondBox.x, 0);
  expect(restoredBox.width).toBeCloseTo(secondBox.width, 0);
  await expect(comp.filter({ hasText: "Take 2" })).toBeVisible();

  // Undo during a drag to discard its preview and keep the original position after release.
  const first = takes
    .filter({ hasText: "Take 1" })
    .getByTestId("recorder-clip-take-lane");
  const firstBox = (await first.boundingBox())!;
  const x = firstBox.x + firstBox.width / 2;
  const y = firstBox.y + firstBox.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 20, y, { steps: 4 });
  const movedX = (await first.boundingBox())!.x;
  expect(movedX).toBeGreaterThan(firstBox.x);
  await page.keyboard.press("Control+z");
  await expect(takes).toHaveCount(1);
  await page.mouse.move(x + 40, y, { steps: 4 });
  await page.mouse.up();
  expect((await first.boundingBox())!.x).toBeCloseTo(firstBox.x, 0);
  await expect(
    takes
      .filter({ hasText: "Take 1" })
      .getByTestId("recorder-clip-take-lane-source"),
  ).not.toHaveAttribute("data-selected", "true");

  // Record a replacement take with a new number and discard the undone take's redo entry.
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 3);
  await record.click();
  await expect(record).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Control+Shift+z");
  await expect(second).toHaveCount(0);
  await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));
  await record.click();
  await expect(takes).toHaveCount(2);
  await expect(takes.nth(1)).toContainText("Take 3");
  await page.keyboard.press("Control+Shift+z");
  await expect(takes).toHaveCount(2);
  await expect(second).toHaveCount(0);
});
