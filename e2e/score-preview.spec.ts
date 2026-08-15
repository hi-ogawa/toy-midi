import { expect, test } from "@playwright/test";
import { clickNewProject, evaluateStore } from "./helpers";

test("syncs seeking between the score preview and editor timeline", async ({
  page,
}) => {
  await page.goto("/");
  await clickNewProject(page);
  await evaluateStore(page, (store) => {
    store.getState().addNote({
      id: "note-score-preview",
      pitch: 60,
      start: 0,
      duration: 1,
      velocity: 100,
    });
    store.getState().addNote({
      id: "note-score-preview-third-measure",
      pitch: 64,
      start: 8,
      duration: 1,
      velocity: 100,
    });
  });

  const toggle = page.getByTestId("score-preview-button");
  await toggle.click();

  const panel = page.getByTestId("score-preview-panel");
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(
    panel.getByTestId("score-viewer-renderer").locator("svg"),
  ).toBeVisible();

  const cursor = panel.getByTestId("score-viewer-cursor");
  await expect(cursor).toBeVisible();
  const firstMeasureCursor = await cursor.evaluate(
    (element) => element.style.transform,
  );
  const thirdMeasure = panel.locator('[data-measure-index="2"]');

  await thirdMeasure.click({ position: { x: 20, y: 20 } });
  await expect(page.getByTestId("time-display")).toHaveText("03|01 - 00:04:00");
  await expect
    .poll(() => cursor.evaluate((element) => element.style.transform))
    .not.toBe(firstMeasureCursor);

  const timeline = page.getByTestId("timeline");
  const timelineBox = await timeline.boundingBox();
  if (!timelineBox) {
    throw new Error("Timeline not found");
  }
  await page.mouse.click(timelineBox.x, timelineBox.y + timelineBox.height / 2);

  await expect(page.getByTestId("time-display")).toHaveText("01|01 - 00:00:00");
  await expect
    .poll(() => cursor.evaluate((element) => element.style.transform))
    .toBe(firstMeasureCursor);

  await panel.getByRole("button", { name: "Close Score Preview" }).click();
  await expect(panel).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});
