import { expect, test } from "@playwright/test";
import { evaluateStore } from "./helpers";

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

  test("demo project flow", async ({ page }) => {
    // Demo button should be visible
    const demoButton = page.getByTestId("demo-button");
    await expect(demoButton).toBeVisible();

    // Click demo button
    await demoButton.click();

    // Main UI should be visible
    await expect(page.getByTestId("transport")).toBeVisible();
    await expect(page.getByTestId("piano-roll-grid")).toBeVisible();

    // Should have demo notes loaded
    const notes = await evaluateStore(page, (store) => store.getState().notes);
    expect(notes.length).toBeGreaterThan(0);

    // Check that demo notes have expected properties
    const firstNote = notes[0];
    expect(firstNote.id).toContain("demo-");
    expect(firstNote.pitch).toBeGreaterThan(0);
    expect(firstNote.start).toBeGreaterThanOrEqual(0);
    expect(firstNote.duration).toBeGreaterThan(0);

    // Tempo should be 120 (demo default)
    const tempo = await evaluateStore(page, (store) => store.getState().tempo);
    expect(tempo).toBe(120);

    // Audio should be loaded
    const audioFileName = await evaluateStore(
      page,
      (store) => store.getState().audioFileName,
    );
    expect(audioFileName).toBe("test-audio.wav");

    const audioDuration = await evaluateStore(
      page,
      (store) => store.getState().audioDuration,
    );
    expect(audioDuration).toBeGreaterThan(0);
  });

  test("Enter key shortcut", async ({ page }) => {
    // Without saved project, Enter should do nothing
    await expect(page.getByTestId("startup-screen")).toBeVisible();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    await expect(page.getByTestId("startup-screen")).toBeVisible();
    await expect(page.getByTestId("transport")).not.toBeVisible();

    // Create a project
    await page.getByTestId("new-project-button").click();
    await evaluateStore(page, (store) => {
      store.getState().addNote({
        id: "test-note-enter",
        pitch: 65,
        start: 0.5,
        duration: 1.5,
        velocity: 90,
      });
    });
    await page.waitForTimeout(600);

    // With saved project, Enter should continue
    await page.reload();
    await expect(page.getByTestId("continue-button")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("transport")).toBeVisible();

    const notes = await evaluateStore(page, (store) => store.getState().notes);
    expect(notes).toHaveLength(1);
    expect(notes[0].pitch).toBe(65);
  });
});
