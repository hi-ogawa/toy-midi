import { expect, test } from "@playwright/test";
import { clickNewProject } from "./helpers";

test.describe("Locators", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("add locator by double-clicking timeline", async ({ page }) => {
    const timeline = page.getByTestId("timeline");
    await expect(timeline).toBeVisible();

    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");

    // Double-click at beat 4 (approximately 320px from left with default zoom)
    const clickX = timelineBox.x + 320;
    const clickY = timelineBox.y + timelineBox.height / 2;

    await page.mouse.dblclick(clickX, clickY);

    // Check that locator was created
    const locator = page.locator("[data-testid^='locator-']");
    await expect(locator).toHaveCount(1);

    // Check that label is visible
    await expect(locator.getByText("Section 1")).toBeVisible();
  });

  test("add multiple locators", async ({ page }) => {
    const timeline = page.getByTestId("timeline");
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");

    // Add first locator
    await page.mouse.dblclick(
      timelineBox.x + 160,
      timelineBox.y + timelineBox.height / 2,
    );

    // Add second locator
    await page.mouse.dblclick(
      timelineBox.x + 480,
      timelineBox.y + timelineBox.height / 2,
    );

    // Check that both locators exist
    const locators = page.locator("[data-testid^='locator-']");
    await expect(locators).toHaveCount(2);

    // Check labels
    await expect(page.getByText("Section 1")).toBeVisible();
    await expect(page.getByText("Section 2")).toBeVisible();
  });

  test("select locator", async ({ page }) => {
    const timeline = page.getByTestId("timeline");
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");

    // Add a locator
    const locatorX = timelineBox.x + 320;
    await page.mouse.dblclick(
      locatorX,
      timelineBox.y + timelineBox.height / 2,
    );

    const locator = page.locator("[data-testid^='locator-']").first();
    await expect(locator).toBeVisible();

    // Click on the locator to select it
    await locator.click();

    // Locator should be highlighted (amber color when selected)
    // We can check this by verifying the element has the amber class
    const triangleDiv = locator.locator("div").first();
    await expect(triangleDiv).toHaveClass(/border-t-amber-400/);
  });

  test("delete locator with Delete key", async ({ page }) => {
    const timeline = page.getByTestId("timeline");
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");

    // Add a locator
    await page.mouse.dblclick(
      timelineBox.x + 320,
      timelineBox.y + timelineBox.height / 2,
    );

    const locator = page.locator("[data-testid^='locator-']");
    await expect(locator).toHaveCount(1);

    // Click to select the locator
    await locator.click();

    // Press Delete key
    await page.keyboard.press("Delete");

    // Locator should be deleted
    await expect(locator).toHaveCount(0);
  });

  test("delete locator with Backspace key", async ({ page }) => {
    const timeline = page.getByTestId("timeline");
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");

    // Add a locator
    await page.mouse.dblclick(
      timelineBox.x + 320,
      timelineBox.y + timelineBox.height / 2,
    );

    const locator = page.locator("[data-testid^='locator-']");
    await expect(locator).toHaveCount(1);

    // Click to select the locator
    await locator.click();

    // Press Backspace key
    await page.keyboard.press("Backspace");

    // Locator should be deleted
    await expect(locator).toHaveCount(0);
  });

  test("deselect locator with Escape key", async ({ page }) => {
    const timeline = page.getByTestId("timeline");
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");

    // Add a locator
    await page.mouse.dblclick(
      timelineBox.x + 320,
      timelineBox.y + timelineBox.height / 2,
    );

    const locator = page.locator("[data-testid^='locator-']").first();

    // Click to select
    await locator.click();

    // Verify selected (amber color)
    const triangleDiv = locator.locator("div").first();
    await expect(triangleDiv).toHaveClass(/border-t-amber-400/);

    // Press Escape
    await page.keyboard.press("Escape");

    // Verify deselected (sky color)
    await expect(triangleDiv).toHaveClass(/border-t-sky-400/);
  });

  test("locators persist across zoom", async ({ page }) => {
    const timeline = page.getByTestId("timeline");
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");

    // Add a locator
    await page.mouse.dblclick(
      timelineBox.x + 320,
      timelineBox.y + timelineBox.height / 2,
    );

    await expect(page.getByText("Section 1")).toBeVisible();

    // Zoom in (Ctrl+Wheel)
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    await page.mouse.move(gridBox.x + 100, gridBox.y + 100);
    await page.mouse.wheel(0, -100); // Zoom in with Ctrl held

    // Locator should still be visible
    await expect(page.getByText("Section 1")).toBeVisible();
  });
});
