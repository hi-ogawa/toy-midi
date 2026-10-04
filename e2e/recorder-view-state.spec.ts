import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import { selectMenuItem } from "./helpers";
import {
  createRecorderProject,
  dragBy,
  getRecorderBeat,
  seekRecorderByPixels,
} from "./recorder-helpers";

test("restores the timeline, playhead, and panels when reopening a project", async ({
  page,
}) => {
  // Scroll the timeline four beats right and seek two beats into the view.
  await createRecorderProject(page);
  const ruler = page.getByTestId("recorder-timeline-ruler");
  const rulerBox = (await ruler.boundingBox())!;
  await page.mouse.move(rulerBox.x + 100, rulerBox.y + rulerBox.height / 2);
  await page.mouse.wheel(0, 4 * DEFAULT_PIXELS_PER_BEAT);
  await seekRecorderByPixels(page, 2 * DEFAULT_PIXELS_PER_BEAT);
  await expect.poll(() => getRecorderBeat(page)).toBeCloseTo(6, 1);

  // Open the capture track's effects panel and enlarge it.
  await selectMenuItem(page, { menu: "Audio 1 actions", item: "Effects…" });
  const effects = page.getByTestId("recorder-effects-panel");
  const initialEffectsBox = (await effects.boundingBox())!;
  await dragBy(
    page,
    page.getByRole("button", { name: "Resize Audio 1 Effects" }),
    -60,
    {
      deltaY: -40,
    },
  );
  const effectsBox = (await effects.boundingBox())!;
  expect(effectsBox.width).toBeGreaterThan(initialEffectsBox.width);

  // Reload, and confirm the playhead, the effects panel, and its size come
  // back without marking the project unsaved.
  await page.reload();
  await expect.poll(() => getRecorderBeat(page)).toBeCloseTo(6, 1);
  await expect(effects).toBeVisible();
  const reloadedBox = (await effects.boundingBox())!;
  expect(reloadedBox.width).toBeCloseTo(effectsBox.width, -1);
  expect(reloadedBox.height).toBeCloseTo(effectsBox.height, -1);
  await expect(page.getByTestId("recorder-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );

  // Seek at the same ruler point, and confirm the scroll came back too.
  await seekRecorderByPixels(page, 3 * DEFAULT_PIXELS_PER_BEAT);
  await expect.poll(() => getRecorderBeat(page)).toBeCloseTo(7, 1);

  // Open another project, and confirm it starts at its own defaults.
  await createRecorderProject(page);
  await expect.poll(() => getRecorderBeat(page)).toBe(0);
  await expect(effects).toBeHidden();
});
