import { expect, test } from "@playwright/test";
import { evaluateStore } from "./helpers";

test.describe("Startup Screen", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to control test state
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  });

  test("new project flow", async ({ page }) => {
    await page.reload();

    // Startup screen should be visible
    const startupScreen = page.getByTestId("startup-screen");
    await expect(startupScreen).toBeVisible();

    // Main UI should NOT be visible yet
    await expect(page.getByTestId("transport")).not.toBeVisible();
    await expect(page.getByTestId("piano-roll-grid")).not.toBeVisible();

    // New project button should be visible
    const newProjectButton = page.getByTestId("new-project-button");
    await expect(newProjectButton).toBeVisible();

    // Continue button should NOT be visible (no saved project)
    await expect(page.getByTestId("continue-button")).not.toBeVisible();

    // Click new project
    await newProjectButton.click();

    // Main UI should now be visible
    await expect(page.getByTestId("transport")).toBeVisible();
    await expect(page.getByTestId("piano-roll-grid")).toBeVisible();

    // Should have empty state
    const notes = await evaluateStore(page, (store) => store.getState().notes);
    expect(notes).toHaveLength(0);

    const tempo = await evaluateStore(page, (store) => store.getState().tempo);
    expect(tempo).toBe(120);
  });

  test("continue project flow", async ({ page }) => {
    // First, create a project with some data via store
    await page.reload();

    const newProjectButton = page.getByTestId("new-project-button");
    await newProjectButton.click();

    await evaluateStore(page, (store) => {
      store.getState().addNote({
        id: "test-note-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      });
      store.getState().setTempo(140);
    });

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Reload - continue button should now be visible
    await page.reload();

    const continueButton = page.getByTestId("continue-button");
    await expect(continueButton).toBeVisible();
    await continueButton.click();

    // Main UI should be visible with restored state
    await expect(page.getByTestId("transport")).toBeVisible();

    const notes = await evaluateStore(page, (store) => store.getState().notes);
    expect(notes).toHaveLength(1);

    const tempo = await evaluateStore(page, (store) => store.getState().tempo);
    expect(tempo).toBe(140);
  });
});
