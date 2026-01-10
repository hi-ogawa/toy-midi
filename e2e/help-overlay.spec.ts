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

    // Click help button to show help
    await page.getByTestId("help-button").click();
    await expect(page.getByTestId("help-overlay")).toBeVisible();

    // Check that it contains expected content
    await expect(
      page.getByRole("heading", { name: "Quick Reference" }),
    ).toBeVisible();
    await expect(page.getByText("Play / Pause")).toBeVisible();
    await expect(page.getByText("Delete selected notes").first()).toBeVisible();

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

    // Check for keyboard shortcuts
    await expect(page.locator("kbd", { hasText: /^Space$/ })).toBeVisible();
    await expect(page.locator("kbd", { hasText: /^Delete$/ })).toBeVisible();
    await expect(page.locator("kbd", { hasText: /^Escape$/ })).toBeVisible();

    // Check for mouse actions
    await expect(page.getByText("Create new note")).toBeVisible();
    await expect(page.getByText("Move note (time + pitch)")).toBeVisible();
    await expect(page.getByText("Zoom in / out")).toBeVisible();

    // Click inside modal content - should stay open
    await page.getByRole("heading", { name: "Quick Reference" }).click();
    await expect(page.getByTestId("help-overlay")).toBeVisible();

    // Click backdrop to close
    await page
      .getByTestId("help-overlay")
      .click({ position: { x: 10, y: 10 } });
    await expect(page.getByTestId("help-overlay")).not.toBeVisible();

    // Open again and close with Escape
    await page.getByTestId("help-button").click();
    await expect(page.getByTestId("help-overlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("help-overlay")).not.toBeVisible();
  });
});
