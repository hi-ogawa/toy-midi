import { expect, test } from "@playwright/test";
import { evaluateStore, evaluateFlushAutoSave } from "./helpers";

test.describe("Startup Screen", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to control test state
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("new project flow", async ({ page }) => {
    // Startup screen should be visible
    const startupScreen = page.getByTestId("startup-screen");
    await expect(startupScreen).toBeVisible();

    // Main UI should NOT be visible yet
    await expect(page.getByTestId("transport")).not.toBeVisible();
    await expect(page.getByTestId("piano-roll-grid")).not.toBeVisible();

    // New project button should be visible
    const newProjectButton = page.getByTestId("new-project-button");
    await expect(newProjectButton).toBeVisible();

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

  test("open existing project flow", async ({ page }) => {
    // First, create a project with some data via store
    const newProjectButton = page.getByTestId("new-project-button");
    await newProjectButton.click();
    await page.getByTestId("transport").waitFor({ state: "visible" });

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

    await evaluateFlushAutoSave(page);

    // Open the saved project from the project list
    await page.goto("/");
    await page.locator('[data-testid^="project-card-"]').click();

    // Main UI should be visible with restored state
    await expect(page.getByTestId("transport")).toBeVisible();

    const notes = await evaluateStore(page, (store) => store.getState().notes);
    expect(notes).toHaveLength(1);

    const tempo = await evaluateStore(page, (store) => store.getState().tempo);
    expect(tempo).toBe(140);
  });
});
