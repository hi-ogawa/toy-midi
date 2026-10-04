import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import { selectMenuItem } from "./helpers";
import {
  createRecorderProject,
  getRecorderBeat,
  scrollRecorderTimelineByPixels,
  seekRecorderByPixels,
} from "./recorder-helpers";

test("restores the timeline, playhead, and panels when reopening a project", async ({
  page,
}) => {
  // Scroll the timeline four beats right and seek two beats into the view.
  await createRecorderProject(page);
  await scrollRecorderTimelineByPixels(page, 4 * DEFAULT_PIXELS_PER_BEAT);
  await seekRecorderByPixels(page, 2 * DEFAULT_PIXELS_PER_BEAT);
  await expect.poll(() => getRecorderBeat(page)).toBeCloseTo(6, 1);

  // Open the capture track's effects panel.
  await selectMenuItem(page, { menu: "Audio 1 actions", item: "Effects…" });
  const effects = page.getByTestId("recorder-effects-panel");
  await expect(effects).toBeVisible();

  // Reload, and confirm the playhead and the effects panel come back without
  // marking the project unsaved.
  await page.reload();
  await expect.poll(() => getRecorderBeat(page)).toBeCloseTo(6, 1);
  await expect(effects).toBeVisible();
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
