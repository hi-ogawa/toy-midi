import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import { selectMenuItem } from "./helpers";
import { createRecorderProject, saveRecorderProject } from "./recorder-helpers";

test("drops audio onto a track at the snapped timeline position", async ({
  page,
}) => {
  // Create a project with an ordinary audio track for file drops.
  await createRecorderProject(page);
  const row = page.getByTestId("recorder-audio-track-row");
  const sources = row.getByTestId("recorder-clip-audio-source");
  const regions = row.getByTestId("recorder-clip-audio");

  // Import a file into the default Audio 1 at the start.
  const chooser = page.waitForEvent("filechooser");
  await selectMenuItem(page, {
    menu: "Audio 1 actions",
    item: "Import audio…",
  });
  await (await chooser).setFiles("e2e/fixtures/test-audio.wav");
  await expect(sources).toHaveCount(1);
  const ruler = (await page
    .getByTestId("recorder-timeline-ruler")
    .boundingBox())!;
  expect((await sources.boundingBox())!.x).toBeCloseTo(ruler.x, -1);

  // Drop another file on the lane, which appends it at the drop position.
  const bytes = [...(await readFile("e2e/fixtures/test-tones.wav"))];
  const dataTransfer = await page.evaluateHandle((bytes) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(
      new File([new Uint8Array(bytes)], "dropped.wav", { type: "audio/wav" }),
    );
    return dataTransfer;
  }, bytes);
  await sources.first().dispatchEvent("drop", {
    dataTransfer,
    clientX: ruler.x + DEFAULT_PIXELS_PER_BEAT * 4.1,
  });
  await expect(sources).toHaveCount(2);
  // The newer clip wins the comp from its start onward.
  const dropped = regions.filter({ hasText: "dropped.wav" });
  expect((await dropped.boundingBox())!.x).toBeCloseTo(
    ruler.x + DEFAULT_PIXELS_PER_BEAT * 4,
    -1,
  );

  // Undo the drop and keep the original imported clip.
  await page.keyboard.press("Control+z");
  await expect(sources).toHaveCount(1);
  await expect(regions).toHaveCount(1);
  await expect(regions).toContainText("test-audio.wav");

  // Redo the drop, then save and reload both clips at their original positions.
  await page.keyboard.press("Control+Shift+z");
  await expect(sources).toHaveCount(2);
  await saveRecorderProject(page);
  await page.reload();
  await expect(sources).toHaveCount(2);
  await expect(regions.filter({ hasText: "test-audio.wav" })).toBeVisible();
  await expect(dropped).toBeVisible();
  const restoredRuler = (await page
    .getByTestId("recorder-timeline-ruler")
    .boundingBox())!;
  expect((await dropped.boundingBox())!.x).toBeCloseTo(
    restoredRuler.x + DEFAULT_PIXELS_PER_BEAT * 4,
    -1,
  );
});
