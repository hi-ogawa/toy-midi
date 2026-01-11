import { expect, test } from "@playwright/test";
import { clickContinue, clickNewProject } from "./helpers";

test.describe("Locators", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("create locator with double-click", async ({ page }) => {
    const timeline = page.getByTestId("timeline");
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");

    // Double-click on timeline to create locator
    const clickX = timelineBox.x + 100;
    const clickY = timelineBox.y + timelineBox.height / 2;
    await page.mouse.dblclick(clickX, clickY);

    // Locator should be created
    const locator = page.locator("[data-locator-id]");
    await expect(locator).toHaveCount(1);
  });

  test("click locator to seek", async ({ page }) => {
    const timeline = page.getByTestId("timeline");
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");

    // Create locator at position
    const clickX = timelineBox.x + 200;
    const clickY = timelineBox.y + timelineBox.height / 2;
    await page.mouse.dblclick(clickX, clickY);

    // Wait for locator to be created
    const locator = page.locator("[data-locator-id]");
    await expect(locator).toHaveCount(1);

    // Click on the locator marker (click on the SVG)
    await locator.click();

    // Check that playhead moved (it should be visible now)
    const playhead = page.getByTestId("timeline-playhead");
    await expect(playhead).toBeVisible();
  });

  test("delete locator with Delete key", async ({ page }) => {
    const timeline = page.getByTestId("timeline");
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");

    // Create locator
    const clickX = timelineBox.x + 150;
    const clickY = timelineBox.y + timelineBox.height / 2;
    await page.mouse.dblclick(clickX, clickY);

    // Locator should be created
    const locator = page.locator("[data-locator-id]");
    await expect(locator).toHaveCount(1);

    // Click to select it
    await locator.click();

    // Delete with Delete key
    await page.keyboard.press("Delete");

    // Locator should be gone
    await expect(locator).toHaveCount(0);
  });

  test("multiple locators", async ({ page }) => {
    const timeline = page.getByTestId("timeline");
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");

    // Create first locator
    await page.mouse.dblclick(
      timelineBox.x + 100,
      timelineBox.y + timelineBox.height / 2,
    );

    // Create second locator
    await page.mouse.dblclick(
      timelineBox.x + 300,
      timelineBox.y + timelineBox.height / 2,
    );

    // Should have 2 locators
    const locators = page.locator("[data-locator-id]");
    await expect(locators).toHaveCount(2);
  });

  test("locators persist across reload", async ({ page }) => {
    const timeline = page.getByTestId("timeline");
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");

    // Create locator
    await page.mouse.dblclick(
      timelineBox.x + 200,
      timelineBox.y + timelineBox.height / 2,
    );

    // Verify locator exists
    const locator = page.locator("[data-locator-id]");
    await expect(locator).toHaveCount(1);

    // Wait a bit for auto-save (debounced 500ms)
    await page.waitForTimeout(1000);

    // Reload page
    await page.reload();

    // Wait for startup screen and use Continue button to restore project
    await clickContinue(page);

    // Locator should still exist
    const restoredLocator = page.locator("[data-locator-id]");
    await expect(restoredLocator).toHaveCount(1);
  });
});
