import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import {
  createProject,
  getBeat,
  scrollTimelineByPixels,
  seekByPixels,
} from "./editor-helpers";
import { selectMenuItem } from "./helpers";

test("restores the timeline, playhead, and panels when reopening a project", async ({
  page,
}) => {
  // Scroll the timeline four beats right and seek two beats into the view.
  await createProject(page);
  await scrollTimelineByPixels(page, 4 * DEFAULT_PIXELS_PER_BEAT);
  await seekByPixels(page, 2 * DEFAULT_PIXELS_PER_BEAT);
  await expect.poll(() => getBeat(page)).toBeCloseTo(6, 1);

  // Open the capture track's effects panel.
  await selectMenuItem(page, { menu: "Audio 1 actions", item: "Effects…" });
  const effects = page.getByTestId("effects-panel");
  await expect(effects).toBeVisible();

  // Reload, and confirm the playhead and the effects panel come back without
  // marking the project unsaved.
  await page.reload();
  await expect.poll(() => getBeat(page)).toBeCloseTo(6, 1);
  await expect(effects).toBeVisible();
  await expect(page.getByTestId("save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );

  // Seek three beats into the view, and confirm it lands at beat 7, which
  // shows the four-beat scroll came back too.
  await seekByPixels(page, 3 * DEFAULT_PIXELS_PER_BEAT);
  await expect.poll(() => getBeat(page)).toBeCloseTo(7, 1);

  // Open another project, and confirm it starts at its own defaults.
  await createProject(page);
  await expect.poll(() => getBeat(page)).toBe(0);
  await expect(effects).toBeHidden();
});
