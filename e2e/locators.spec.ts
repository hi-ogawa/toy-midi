import { expect, test } from "@playwright/test";
import { clickNewProject } from "./helpers";

test.describe("Locators", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("add, select, delete, and deselect locators", async ({ page }) => {
    const timeline = page.getByTestId("timeline");
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");
    const locators = page.locator("[data-testid^='locator-']");

    // Add first locator at beat 0 (auto-selected)
    await page.keyboard.press("l");
    await expect(locators).toHaveCount(1);
    await expect(page.getByText("Section 1")).toBeVisible();

    // Verify auto-selected (amber color)
    const triangleDiv = locators.first().locator("div").first();
    await expect(triangleDiv).toHaveClass(/border-t-amber-400/);

    // Deselect with Escape
    await page.keyboard.press("Escape");
    await expect(triangleDiv).toHaveClass(/border-neutral-500/);

    // Seek to beat 4 and add second locator
    await page.mouse.click(
      timelineBox.x + 320,
      timelineBox.y + timelineBox.height / 2,
    );
    await page.keyboard.press("l");
    await expect(locators).toHaveCount(2);
    await expect(page.getByText("Section 2")).toBeVisible();

    // Delete second locator with Delete key (it's auto-selected)
    await page.keyboard.press("Delete");
    await expect(locators).toHaveCount(1);
    await expect(page.getByText("Section 2")).not.toBeVisible();

    // Re-add and delete with Backspace
    await page.keyboard.press("l");
    await expect(locators).toHaveCount(2);
    await page.keyboard.press("Backspace");
    await expect(locators).toHaveCount(1);
  });

  test("rename locator via double-click", async ({ page }) => {
    // Add a locator
    await page.keyboard.press("l");
    await expect(page.getByText("Section 1")).toBeVisible();

    const locator = page.locator("[data-testid^='locator-']").first();

    // Set up dialog handler before double-click
    page.on("dialog", async (dialog) => {
      expect(dialog.type()).toBe("prompt");
      expect(dialog.defaultValue()).toBe("Section 1");
      await dialog.accept("Intro");
    });

    // Double-click to rename
    await locator.dblclick();

    // Verify label changed
    await expect(page.getByText("Intro")).toBeVisible();
    await expect(page.getByText("Section 1")).not.toBeVisible();
  });

  test("locators persist across zoom and reload", async ({ page }) => {
    const timeline = page.getByTestId("timeline");
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");

    // Add first locator at beat 0
    await page.keyboard.press("l");
    await expect(page.getByText("Section 1")).toBeVisible();

    // Seek to beat 4 and add second locator
    await page.mouse.click(
      timelineBox.x + 320,
      timelineBox.y + timelineBox.height / 2,
    );
    await page.keyboard.press("l");
    await expect(page.getByText("Section 2")).toBeVisible();

    // Zoom in (Ctrl+Wheel) - verify locators persist
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");
    await page.mouse.move(gridBox.x + 100, gridBox.y + 100);
    await page.mouse.wheel(0, -100);
    await expect(page.getByText("Section 1")).toBeVisible();
    await expect(page.getByText("Section 2")).toBeVisible();

    // Wait for auto-save
    await page.waitForTimeout(1000);

    // Reload page
    await page.reload();

    // Click "Continue" to restore project
    await page.getByTestId("continue-button").click();
    await page.getByTestId("transport").waitFor({ state: "visible" });

    // Verify locators persisted after reload
    await expect(page.getByText("Section 1")).toBeVisible();
    await expect(page.getByText("Section 2")).toBeVisible();
  });
});
