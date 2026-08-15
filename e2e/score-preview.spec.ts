import { expect, test } from "@playwright/test";
import { clickNewProject, evaluateStore } from "./helpers";

test("opens and closes the editor score preview", async ({ page }) => {
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
  });

  const toggle = page.getByTestId("score-preview-button");
  await toggle.click();

  const panel = page.getByTestId("score-preview-panel");
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(
    panel.getByTestId("score-viewer-renderer").locator("svg"),
  ).toBeVisible();

  await panel.getByRole("button", { name: "Close Score Preview" }).click();
  await expect(panel).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});
