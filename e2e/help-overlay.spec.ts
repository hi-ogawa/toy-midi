import { expect, test } from "@playwright/test";
import { clickNewProject } from "./helpers";

test.describe("Help Overlay", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("help overlay workflow", async ({ page }) => {
    // Help should not be visible initially
    await expect(page.getByTestId("help-overlay")).not.toBeVisible();

    // Open help from the application menu
    await page.getByTestId("app-menu-button").click();
    await page.getByTestId("help-menu-item").click();
    await expect(page.getByTestId("help-overlay")).toBeVisible();

    // Check structure: title and category headers
    await expect(
      page.getByRole("heading", { name: "Quick Reference" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Playback", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Editing", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Navigation", exact: true }),
    ).toBeVisible();

    // Check that keyboard shortcuts are rendered (has kbd elements)
    const kbdElements = page.locator("kbd");
    await expect(kbdElements.first()).toBeVisible();
    expect(await kbdElements.count()).toBeGreaterThan(5);

    // Click inside modal content - should stay open
    await page.getByRole("heading", { name: "Quick Reference" }).click();
    await expect(page.getByTestId("help-overlay")).toBeVisible();

    // Click backdrop to close
    await page
      .getByTestId("help-overlay")
      .click({ position: { x: 10, y: 10 } });
    await expect(page.getByTestId("help-overlay")).not.toBeVisible();

    // Open again and close with Escape
    await page.getByTestId("app-menu-button").click();
    await page.getByTestId("help-menu-item").click();
    await expect(page.getByTestId("help-overlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("help-overlay")).not.toBeVisible();

    // Open with ? shortcut
    await page.keyboard.press("?");
    await expect(page.getByTestId("help-overlay")).toBeVisible();

    // Toggle closed with ? shortcut
    await page.keyboard.press("?");
    await expect(page.getByTestId("help-overlay")).not.toBeVisible();
  });

  test("navigates home from the application menu", async ({ page }) => {
    await page.getByTestId("app-menu-button").click();
    await page.getByTestId("home-menu-item").click();

    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("startup-screen")).toBeVisible();
  });
});
