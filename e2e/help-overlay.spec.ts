import { expect, test } from "@playwright/test";
import { clickNewProject } from "./helpers";

test.describe("Help Overlay", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("shows help overlay when pressing ?", async ({ page }) => {
    // Help should not be visible initially
    await expect(page.getByTestId("help-overlay")).not.toBeVisible();

    // Press ? to show help
    await page.keyboard.press("Shift+/"); // ? is Shift+/

    // Help should now be visible
    await expect(page.getByTestId("help-overlay")).toBeVisible();

    // Check that it contains expected content
    await expect(
      page.getByText("Keyboard Shortcuts & Mouse Actions"),
    ).toBeVisible();
    await expect(page.getByText("Play / Pause")).toBeVisible();
    // Use first() since "Delete selected notes" appears twice (for Delete and Backspace)
    await expect(page.getByText("Delete selected notes").first()).toBeVisible();
  });

  test("hides help overlay when pressing ? again", async ({ page }) => {
    // Show help
    await page.keyboard.press("Shift+/");
    await expect(page.getByTestId("help-overlay")).toBeVisible();

    // Press ? again to hide
    await page.keyboard.press("Shift+/");
    await expect(page.getByTestId("help-overlay")).not.toBeVisible();
  });

  test("hides help overlay when pressing Escape", async ({ page }) => {
    // Show help
    await page.keyboard.press("Shift+/");
    await expect(page.getByTestId("help-overlay")).toBeVisible();

    // Press Escape to hide
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("help-overlay")).not.toBeVisible();
  });

  test("hides help overlay when clicking backdrop", async ({ page }) => {
    // Show help
    await page.keyboard.press("Shift+/");
    await expect(page.getByTestId("help-overlay")).toBeVisible();

    // Click the backdrop (outside the modal content)
    await page
      .getByTestId("help-overlay")
      .click({ position: { x: 10, y: 10 } });
    await expect(page.getByTestId("help-overlay")).not.toBeVisible();
  });

  test("does not close when clicking inside modal content", async ({
    page,
  }) => {
    // Show help
    await page.keyboard.press("Shift+/");
    await expect(page.getByTestId("help-overlay")).toBeVisible();

    // Click inside the modal content
    await page.getByText("Keyboard Shortcuts & Mouse Actions").click();

    // Help should still be visible
    await expect(page.getByTestId("help-overlay")).toBeVisible();
  });

  test("displays keyboard shortcuts by category", async ({ page }) => {
    await page.keyboard.press("Shift+/");

    // Check for category headers (use getByRole for exact heading match)
    await expect(
      page.getByRole("heading", { name: "Playback", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Editing", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Help", exact: true }),
    ).toBeVisible();

    // Check for specific shortcuts by looking for kbd elements
    await expect(page.locator('kbd:has-text("Space")').first()).toBeVisible();
    await expect(page.locator('kbd:has-text("Delete")')).toBeVisible();
    await expect(page.locator('kbd:has-text("Backspace")')).toBeVisible();
    await expect(page.locator('kbd:has-text("Escape")')).toBeVisible();
  });

  test("displays mouse actions by category", async ({ page }) => {
    await page.keyboard.press("Shift+/");

    // Check for mouse action categories (use getByRole for exact heading match)
    await expect(
      page.getByRole("heading", { name: "Note Editing", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Selection", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Navigation", exact: true }),
    ).toBeVisible();

    // Check for specific mouse actions
    await expect(page.getByText("Create new note")).toBeVisible();
    await expect(page.getByText("Move note (time + pitch)")).toBeVisible();
    await expect(page.getByText("Box select multiple notes")).toBeVisible();
  });
});
