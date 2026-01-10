import { expect, test } from "@playwright/test";
import { clickNewProject } from "./helpers";

test.describe("Help Overlay", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("shows help overlay when clicking help button", async ({ page }) => {
    // Help should not be visible initially
    await expect(page.getByTestId("help-overlay")).not.toBeVisible();

    // Click help button to show help
    await page.getByTestId("help-button").click();

    // Help should now be visible
    await expect(page.getByTestId("help-overlay")).toBeVisible();

    // Check that it contains expected content
    await expect(
      page.getByRole("heading", { name: "Quick Reference" }),
    ).toBeVisible();
    await expect(page.getByText("Play / Pause")).toBeVisible();
    // Use first() since "Delete selected notes" appears twice (for Delete and Backspace)
    await expect(page.getByText("Delete selected notes").first()).toBeVisible();
  });

  test("hides help overlay when pressing Escape", async ({ page }) => {
    // Show help
    await page.getByTestId("help-button").click();
    await expect(page.getByTestId("help-overlay")).toBeVisible();

    // Press Escape to hide
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("help-overlay")).not.toBeVisible();
  });

  test("hides help overlay when clicking backdrop", async ({ page }) => {
    // Show help
    await page.getByTestId("help-button").click();
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
    await page.getByTestId("help-button").click();
    await expect(page.getByTestId("help-overlay")).toBeVisible();

    // Click inside the modal content
    await page.getByRole("heading", { name: "Quick Reference" }).click();

    // Help should still be visible
    await expect(page.getByTestId("help-overlay")).toBeVisible();
  });

  test("displays items organized by category", async ({ page }) => {
    await page.getByTestId("help-button").click();

    // Check for category headers
    await expect(
      page.getByRole("heading", { name: "Playback", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Editing", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Navigation", exact: true }),
    ).toBeVisible();

    // Check for keyboard shortcuts (rendered as kbd elements)
    await expect(page.locator("kbd", { hasText: /^Space$/ })).toBeVisible();
    await expect(page.locator("kbd", { hasText: /^Delete$/ })).toBeVisible();
    await expect(page.locator("kbd", { hasText: /^Escape$/ })).toBeVisible();

    // Check for mouse actions
    await expect(page.getByText("Create new note")).toBeVisible();
    await expect(page.getByText("Move note (time + pitch)")).toBeVisible();
    await expect(page.getByText("Zoom in / out")).toBeVisible();
  });
});
