import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import { useFakeAudioInput } from "./helpers";
import {
  addRecorderAudio,
  createRecorderProject,
  dragBy,
  enableInput,
  seekRecorderByPixels,
  waitForRecordingSamples,
} from "./recorder-helpers";

useFakeAudioInput();

test("selects and moves audio and take clips together", async ({ page }) => {
  await createRecorderProject(page);

  // Import a backing track.
  await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");
  const audio = page.getByTestId("recorder-clip-audio-source");

  // Record a take away from zero.
  await enableInput(page);
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 2);
  const recordButton = page.getByTestId("recorder-record-button");
  await recordButton.click();
  await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));
  await recordButton.click();
  const take = page.getByTestId("recorder-clip-comp-source");
  await expect(take).toBeVisible();

  // Ctrl-click adds the take to the selected backing track.
  await audio.click();
  await take.click({ modifiers: ["Control"] });
  await expect(audio).toHaveAttribute("data-selected", "true");
  await expect(take).toHaveAttribute("data-selected", "true");

  // Dragging either selected clip moves the whole selection.
  const audioBefore = await audio.boundingBox();
  const takeBefore = await take.boundingBox();
  expect(audioBefore).not.toBeNull();
  expect(takeBefore).not.toBeNull();
  const takeCenter = {
    x: takeBefore!.x + takeBefore!.width / 2,
    y: takeBefore!.y + takeBefore!.height / 2,
  };
  await page.mouse.move(takeCenter.x, takeCenter.y);
  await page.mouse.down();
  await page.mouse.move(takeCenter.x + DEFAULT_PIXELS_PER_BEAT, takeCenter.y, {
    steps: 4,
  });
  await page.mouse.up();

  // Both clips preserve their relative spacing through the shared movement.
  const audioAfter = await audio.boundingBox();
  const takeAfter = await take.boundingBox();
  expect(audioAfter!.x - audioBefore!.x).toBeCloseTo(
    DEFAULT_PIXELS_PER_BEAT,
    -1,
  );
  expect(takeAfter!.x - takeBefore!.x).toBeCloseTo(DEFAULT_PIXELS_PER_BEAT, -1);

  // Delete clears every selected clip while preserving the audio track row.
  await page.keyboard.press("Delete");
  await expect(audio).toHaveCount(0);
  await expect(take).toHaveCount(0);
  await expect(page.getByText("Load an audio file")).toBeVisible();
  await expect(page.getByTestId("recorder-audio-track-row")).toBeVisible();
});

for (const { edge, modifier, delta } of [
  { edge: "start", modifier: "Control", delta: 10 },
  { edge: "end", modifier: "Meta", delta: -10 },
]) {
  test(`adds an unselected clip with ${modifier} while trimming its ${edge}`, async ({
    page,
  }) => {
    // Load two clips and select only the first.
    await createRecorderProject(page);
    await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");
    await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");
    const clips = page.getByTestId("recorder-clip-audio-source");
    const first = clips.nth(0);
    const second = clips.nth(1);
    await page.keyboard.press("Escape");
    await first.click();
    await expect(first).toHaveAttribute("data-selected", "true");
    await expect(second).not.toHaveAttribute("data-selected", "true");
    const firstBefore = (await first.boundingBox())!;
    const secondBefore = (await second.boundingBox())!;

    // Modifier-trim the second clip to add it and trim both clips together.
    await page.keyboard.down(modifier);
    await dragBy(page, second.getByTestId(`recorder-take-trim-${edge}`), delta);
    await page.keyboard.up(modifier);
    await expect(first).toHaveAttribute("data-selected", "true");
    await expect(second).toHaveAttribute("data-selected", "true");
    expect((await first.boundingBox())!.width).toBeCloseTo(
      firstBefore.width - 10,
      0,
    );
    expect((await second.boundingBox())!.width).toBeCloseTo(
      secondBefore.width - 10,
      0,
    );

    // Trim an already selected clip without a modifier and preserve the group.
    await dragBy(page, second.getByTestId(`recorder-take-trim-${edge}`), delta);
    expect((await first.boundingBox())!.width).toBeCloseTo(
      firstBefore.width - 20,
      0,
    );
    expect((await second.boundingBox())!.width).toBeCloseTo(
      secondBefore.width - 20,
      0,
    );

    // Select only the first, then trim the unselected second to replace selection.
    await page.keyboard.press("Escape");
    await first.click();
    await dragBy(page, second.getByTestId(`recorder-take-trim-${edge}`), delta);
    await expect(first).not.toHaveAttribute("data-selected", "true");
    await expect(second).toHaveAttribute("data-selected", "true");
    expect((await first.boundingBox())!.width).toBeCloseTo(
      firstBefore.width - 20,
      0,
    );
    expect((await second.boundingBox())!.width).toBeCloseTo(
      secondBefore.width - 30,
      0,
    );
  });
}
