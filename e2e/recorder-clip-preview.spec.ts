import { expect, test, type Locator, type Page } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import { useFakeAudioInput } from "./helpers";
import {
  addRecorderAudio,
  addRecorderMidiTrack,
  createRecorderMidiNote,
  createRecorderProject,
  enableInput,
  getRecorderPosition,
  saveRecorderProject,
  seekRecorderByPixels,
} from "./recorder-helpers";

useFakeAudioInput();

test("previews clip moves and trims, commits on release, and cancels on Escape or undo", async ({
  page,
}) => {
  // Load audio and a MIDI note, then save before starting any clip edit.
  await createRecorderProject(page);
  await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");
  const midi = await addRecorderMidiTrack(page);
  const note = await createRecorderMidiNote(page, midi, {
    beat: 0,
    pitch: "C4",
  });
  await saveRecorderProject(page);
  const save = page.getByTestId("recorder-save-button");
  const clip = page.getByTestId("recorder-clip-audio-source");
  const original = (await clip.boundingBox())!;
  const delta = DEFAULT_PIXELS_PER_BEAT;

  // Move without releasing and keep the project saved, then cancel and ignore further movement.
  let pointer = await beginDrag(page, clip, delta);
  expect((await clip.boundingBox())!.x).toBeCloseTo(original.x + delta, 0);
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.keyboard.press("Escape");
  await page.mouse.move(pointer.x + delta * 2, pointer.y, { steps: 4 });
  await page.mouse.up();
  expect((await clip.boundingBox())!.x).toBeCloseTo(original.x, 0);
  await expect(save).toHaveAttribute("data-status", "saved");

  // Release a second drag and persist precisely the visible final position.
  await beginDrag(page, clip, delta);
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.mouse.up();
  expect((await clip.boundingBox())!.x).toBeCloseTo(original.x + delta, 0);
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await saveRecorderProject(page);

  // Preview a start trim and discard it when undo removes the last MIDI note edit.
  pointer = await beginDrag(
    page,
    clip.getByTestId("recorder-take-trim-start"),
    20,
  );
  expect((await clip.boundingBox())!.width).toBeCloseTo(original.width - 20, 0);
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.keyboard.press("Control+z");
  await expect(note).toHaveCount(0);
  await page.mouse.move(pointer.x + 40, pointer.y, { steps: 4 });
  await page.mouse.up();
  expect((await clip.boundingBox())!.width).toBeCloseTo(original.width, 0);
  await saveRecorderProject(page);

  // Clamp a trim past the opposite edge and commit the same minimum-width preview.
  await beginDrag(
    page,
    clip.getByTestId("recorder-take-trim-end"),
    -original.width - 30,
  );
  const preview = (await clip.boundingBox())!;
  expect(preview.width).toBeCloseTo(2, 0);
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.mouse.up();
  expect((await clip.boundingBox())!.width).toBeCloseTo(preview.width, 0);
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await saveRecorderProject(page);
  await page.reload();
  await expect(clip).toBeVisible();
  expect((await clip.boundingBox())!.x).toBeCloseTo(original.x + delta, 0);
  expect((await clip.boundingBox())!.width).toBeCloseTo(preview.width, 0);
});

test("previews capture overlap regions without saving the drag", async ({
  page,
}) => {
  // Record two overlapping takes and expand their source lanes.
  await createRecorderProject(page);
  await enableInput(page);
  const record = page.getByTestId("recorder-record-button");
  await record.click();
  await expect.poll(() => getRecorderPosition(page)).toBeGreaterThan(1.5);
  await record.click();
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 0.5);
  await record.click();
  await expect.poll(() => getRecorderPosition(page)).toBeGreaterThan(1);
  await record.click();
  await page.getByTestId("recorder-takes-toggle").click();
  await saveRecorderProject(page);
  const source = page
    .getByTestId("recorder-take-row")
    .filter({ hasText: "Take 2" })
    .getByTestId("recorder-clip-take-lane-source");
  const comp = page.getByTestId("recorder-clip-comp");
  const originalRegions = await comp.allTextContents();
  const original = (await source.boundingBox())!;

  // Move the later take outside the first and redraw the comp before committing anything.
  await beginDrag(page, source, DEFAULT_PIXELS_PER_BEAT * 3);
  await expect(comp).toHaveCount(2);
  const previewComp = comp.filter({ hasText: "Take 2" });
  expect((await previewComp.boundingBox())!.x).toBeCloseTo(
    original.x + DEFAULT_PIXELS_PER_BEAT * 3,
    0,
  );
  await expect(page.getByTestId("recorder-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );

  // Cancel the move and restore the source lane and combined audio to the saved layout.
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect((await source.boundingBox())!.x).toBeCloseTo(original.x, 0);
  await expect(comp).toHaveText(originalRegions);
  await expect(page.getByTestId("recorder-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
});

async function beginDrag(page: Page, locator: Locator, deltaX: number) {
  const box = (await locator.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y, { steps: 4 });
  return { x, y };
}
