import { expect, test } from "@playwright/test";
import { clickNewProject } from "./helpers";

test.describe("Locators", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("add locator with L key", async ({ page }) => {
    // Press L to add locator at playhead (starts at beat 0)
    await page.keyboard.press("l");

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

    // Add first locator at beat 0
    await page.keyboard.press("l");

    // Seek to beat 4 and add second locator
    await page.mouse.click(
      timelineBox.x + 320,
      timelineBox.y + timelineBox.height / 2,
    );
    await page.keyboard.press("l");

    // Check that both locators exist
    const locators = page.locator("[data-testid^='locator-']");
    await expect(locators).toHaveCount(2);

    // Check labels
    await expect(page.getByText("Section 1")).toBeVisible();
    await expect(page.getByText("Section 2")).toBeVisible();
  });

  test("select locator", async ({ page }) => {
    // Add a locator
    await page.keyboard.press("l");

    const locator = page.locator("[data-testid^='locator-']").first();
    await expect(locator).toBeVisible();

    // Locator is auto-selected after creation, verify it's highlighted
    const triangleDiv = locator.locator("div").first();
    await expect(triangleDiv).toHaveClass(/border-t-amber-400/);
  });

  test("delete locator with Delete key", async ({ page }) => {
    // Add a locator (auto-selected)
    await page.keyboard.press("l");

    const locator = page.locator("[data-testid^='locator-']");
    await expect(locator).toHaveCount(1);

    // Press Delete key
    await page.keyboard.press("Delete");

    // Locator should be deleted
    await expect(locator).toHaveCount(0);
  });

  test("delete locator with Backspace key", async ({ page }) => {
    // Add a locator (auto-selected)
    await page.keyboard.press("l");

    const locator = page.locator("[data-testid^='locator-']");
    await expect(locator).toHaveCount(1);

    // Press Backspace key
    await page.keyboard.press("Backspace");

    // Locator should be deleted
    await expect(locator).toHaveCount(0);
  });

  test("deselect locator with Escape key", async ({ page }) => {
    // Add a locator (auto-selected)
    await page.keyboard.press("l");

    const locator = page.locator("[data-testid^='locator-']").first();

    // Verify selected (amber color)
    const triangleDiv = locator.locator("div").first();
    await expect(triangleDiv).toHaveClass(/border-t-amber-400/);

    // Press Escape
    await page.keyboard.press("Escape");

    // Verify deselected (sky color)
    await expect(triangleDiv).toHaveClass(/border-t-sky-400/);
  });

  test("locators persist across zoom", async ({ page }) => {
    // Add a locator
    await page.keyboard.press("l");
    await expect(page.getByText("Section 1")).toBeVisible();

    // Zoom in (Ctrl+Wheel)
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    await page.mouse.move(gridBox.x + 100, gridBox.y + 100);
    await page.mouse.wheel(0, -100);

    // Locator should still be visible
    await expect(page.getByText("Section 1")).toBeVisible();
  });

  test("locators persist after page reload", async ({ page }) => {
    const timeline = page.getByTestId("timeline");
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");

    // Add first locator at beat 0
    await page.keyboard.press("l");

    // Seek to beat 4 and add second locator
    await page.mouse.click(
      timelineBox.x + 320,
      timelineBox.y + timelineBox.height / 2,
    );
    await page.keyboard.press("l");

    // Wait for auto-save
    await page.waitForTimeout(1000);

    // Verify locators exist
    await expect(page.getByText("Section 1")).toBeVisible();
    await expect(page.getByText("Section 2")).toBeVisible();

    // Reload page
    await page.reload();

    // Click "Continue" to restore project
    await page.getByTestId("continue-button").click();
    await page.getByTestId("transport").waitFor({ state: "visible" });

    // Verify locators persisted
    await expect(page.getByText("Section 1")).toBeVisible();
    await expect(page.getByText("Section 2")).toBeVisible();
  });
});
