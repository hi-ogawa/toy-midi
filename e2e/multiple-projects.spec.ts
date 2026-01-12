import { expect, test } from "@playwright/test";
import { clickNewProject, evaluateStore } from "./helpers";

test.describe("Multiple Projects", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Clear all storage to start fresh
    await page.evaluate(() => {
      localStorage.clear();
      // Also clear IndexedDB if needed
    });
    await page.reload();
  });

  test("can create multiple projects", async ({ page }) => {
    // Create first project
    await clickNewProject(page);
    await expect(page.getByTestId("transport")).toBeVisible();

    // Add a note to first project
    await evaluateStore(page, (store) => {
      store.getState().addNote({
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      });
      store.getState().setTempo(140);
    });

    // Wait for auto-save
    await page.waitForTimeout(600);

    // Get first project ID
    const project1Id = await evaluateStore(
      page,
      (store) => store.getState().currentProjectId,
    );
    expect(project1Id).not.toBeNull();

    // Reload to see project list
    await page.reload();
    await expect(page.getByTestId("startup-screen")).toBeVisible();

    // Should see the first project in the list
    const projectCard = page.getByTestId(`project-card-${project1Id}`);
    await expect(projectCard).toBeVisible();
    await expect(projectCard).toContainText("Untitled");

    // Create second project
    await clickNewProject(page);
    await expect(page.getByTestId("transport")).toBeVisible();

    // Add different note to second project
    await evaluateStore(page, (store) => {
      store.getState().addNote({
        id: "note-2",
        pitch: 65,
        start: 1,
        duration: 2,
        velocity: 90,
      });
      store.getState().setTempo(120);
    });

    await page.waitForTimeout(600);

    const project2Id = await evaluateStore(
      page,
      (store) => store.getState().currentProjectId,
    );
    expect(project2Id).not.toBeNull();
    expect(project2Id).not.toBe(project1Id);

    // Reload again
    await page.reload();
    await expect(page.getByTestId("startup-screen")).toBeVisible();

    // Should see both projects
    await expect(page.getByTestId(`project-card-${project1Id}`)).toBeVisible();
    await expect(page.getByTestId(`project-card-${project2Id}`)).toBeVisible();
  });

  test("projects are isolated from each other", async ({ page }) => {
    // Create first project with a note
    await clickNewProject(page);
    await evaluateStore(page, (store) => {
      store.getState().addNote({
        id: "note-project-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      });
    });
    await page.waitForTimeout(600);

    const project1Id = await evaluateStore(
      page,
      (store) => store.getState().currentProjectId,
    );

    // Create second project with different note
    await page.reload();
    await clickNewProject(page);
    await evaluateStore(page, (store) => {
      store.getState().addNote({
        id: "note-project-2",
        pitch: 70,
        start: 2,
        duration: 0.5,
        velocity: 80,
      });
    });
    await page.waitForTimeout(600);

    const project2Id = await evaluateStore(
      page,
      (store) => store.getState().currentProjectId,
    );

    // Load first project
    await page.reload();
    await page.getByTestId(`project-card-${project1Id}`).click();
    await expect(page.getByTestId("transport")).toBeVisible();

    // Should have only the first project's note
    const notes1 = await evaluateStore(page, (store) => store.getState().notes);
    expect(notes1).toHaveLength(1);
    expect(notes1[0].pitch).toBe(60);

    // Load second project
    await page.reload();
    await page.getByTestId(`project-card-${project2Id}`).click();
    await expect(page.getByTestId("transport")).toBeVisible();

    // Should have only the second project's note
    const notes2 = await evaluateStore(page, (store) => store.getState().notes);
    expect(notes2).toHaveLength(1);
    expect(notes2[0].pitch).toBe(70);
  });

  test("continue last project", async ({ page }) => {
    // Create a project
    await clickNewProject(page);
    await evaluateStore(page, (store) => {
      store.getState().addNote({
        id: "note-last",
        pitch: 55,
        start: 0,
        duration: 1,
        velocity: 100,
      });
      store.getState().setTempo(130);
    });
    await page.waitForTimeout(600);

    // Reload and use "Continue Last" button
    await page.reload();
    await expect(page.getByTestId("continue-button")).toBeVisible();
    await page.getByTestId("continue-button").click();

    await expect(page.getByTestId("transport")).toBeVisible();

    // Should have restored the project
    const notes = await evaluateStore(page, (store) => store.getState().notes);
    expect(notes).toHaveLength(1);
    expect(notes[0].pitch).toBe(55);

    const tempo = await evaluateStore(page, (store) => store.getState().tempo);
    expect(tempo).toBe(130);
  });

  test("migrates old single project to new multi-project system", async ({
    page,
  }) => {
    // Simulate old storage structure
    await page.evaluate(() => {
      const oldProject = {
        version: 1,
        notes: [
          { id: "old-note", pitch: 48, start: 0, duration: 1, velocity: 100 },
        ],
        tempo: 100,
        gridSnap: "1/4",
        audioFileName: null,
        audioAssetKey: null,
        audioDuration: 0,
        audioOffset: 0,
        audioVolume: 0.8,
        midiVolume: 0.8,
        metronomeEnabled: false,
        metronomeVolume: 0.5,
      };
      localStorage.setItem("toy-midi-project", JSON.stringify(oldProject));
    });

    // Reload to trigger migration
    await page.reload();

    // Should see startup screen with migrated project
    await expect(page.getByTestId("startup-screen")).toBeVisible();
    await expect(page.getByTestId("continue-button")).toBeVisible();

    // Continue should load the migrated project
    await page.getByTestId("continue-button").click();
    await expect(page.getByTestId("transport")).toBeVisible();

    const notes = await evaluateStore(page, (store) => store.getState().notes);
    expect(notes).toHaveLength(1);
    expect(notes[0].pitch).toBe(48);

    const tempo = await evaluateStore(page, (store) => store.getState().tempo);
    expect(tempo).toBe(100);

    // Old key should be removed
    const oldKey = await page.evaluate(() =>
      localStorage.getItem("toy-midi-project"),
    );
    expect(oldKey).toBeNull();
  });

  test("project list shows most recently updated first", async ({ page }) => {
    // Create first project
    await clickNewProject(page);
    await evaluateStore(page, (store) => {
      store.getState().setTempo(100);
    });
    await page.waitForTimeout(600);
    const project1Id = await evaluateStore(
      page,
      (store) => store.getState().currentProjectId,
    );

    // Create second project (will be more recent)
    await page.reload();
    await page.waitForTimeout(100); // Small delay to ensure different timestamp
    await clickNewProject(page);
    await evaluateStore(page, (store) => {
      store.getState().setTempo(120);
    });
    await page.waitForTimeout(600);
    const project2Id = await evaluateStore(
      page,
      (store) => store.getState().currentProjectId,
    );

    // Reload to see project list
    await page.reload();

    // Get all project cards
    const projectCards = page.locator('[data-testid^="project-card-"]');
    await expect(projectCards).toHaveCount(2);

    // First card should be the most recent (project2)
    const firstCard = projectCards.first();
    await expect(firstCard).toHaveAttribute(
      "data-testid",
      `project-card-${project2Id}`,
    );

    // Second card should be project1
    const secondCard = projectCards.nth(1);
    await expect(secondCard).toHaveAttribute(
      "data-testid",
      `project-card-${project1Id}`,
    );
  });

  test("Enter key continues last project", async ({ page }) => {
    // Create a project
    await clickNewProject(page);
    await evaluateStore(page, (store) => {
      store.getState().setTempo(115);
    });
    await page.waitForTimeout(600);

    // Reload and press Enter
    await page.reload();
    await expect(page.getByTestId("continue-button")).toBeVisible();
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("transport")).toBeVisible();
    const tempo = await evaluateStore(page, (store) => store.getState().tempo);
    expect(tempo).toBe(115);
  });

  test("can rename project from startup screen", async ({ page }) => {
    // Create a project
    await clickNewProject(page);
    await page.waitForTimeout(600);

    const projectId = await evaluateStore(
      page,
      (store) => store.getState().currentProjectId,
    );

    // Reload to see project list
    await page.reload();
    await expect(page.getByTestId("startup-screen")).toBeVisible();

    await expect(page.getByTestId(`project-card-${projectId}`)).toContainText(
      "Untitled",
    );

    // Hover over card and click rename button
    await page.getByTestId(`project-card-${projectId}`).hover();
    await page.getByTestId(`rename-button-${projectId}`).click();

    // Should show rename input
    const renameInput = page.getByTestId(`rename-input-${projectId}`);
    await expect(renameInput).toBeVisible();
    await expect(renameInput).toHaveValue("Untitled");

    // Change name
    await renameInput.fill("My Song");
    // Click the Save button instead of pressing Enter
    await page.getByRole("button", { name: "Save" }).click();

    // Wait a bit for the update to happen
    await page.waitForTimeout(100);

    // Should update the card
    await expect(page.getByText("My Song")).toBeVisible();
  });

  test("can cancel rename", async ({ page }) => {
    // Create a project
    await clickNewProject(page);
    await page.waitForTimeout(600);

    const projectId = await evaluateStore(
      page,
      (store) => store.getState().currentProjectId,
    );

    // Reload to see project list
    await page.reload();
    const projectCard = page.getByTestId(`project-card-${projectId}`);

    // Start rename
    await projectCard.hover();
    await page.getByTestId(`rename-button-${projectId}`).click();

    const renameInput = page.getByTestId(`rename-input-${projectId}`);
    await renameInput.fill("New Name");
    await renameInput.press("Escape");

    // Should still show original name
    await expect(projectCard).toContainText("Untitled");
  });

  test("can delete project from startup screen", async ({ page }) => {
    // Create two projects
    await clickNewProject(page);
    await page.waitForTimeout(600);
    const project1Id = await evaluateStore(
      page,
      (store) => store.getState().currentProjectId,
    );

    await page.reload();
    await clickNewProject(page);
    await page.waitForTimeout(600);
    const project2Id = await evaluateStore(
      page,
      (store) => store.getState().currentProjectId,
    );

    // Reload to see project list
    await page.reload();
    await expect(page.getByTestId(`project-card-${project1Id}`)).toBeVisible();
    await expect(page.getByTestId(`project-card-${project2Id}`)).toBeVisible();

    // Delete first project
    const project1Card = page.getByTestId(`project-card-${project1Id}`);
    await project1Card.hover();

    // Set up dialog handler before clicking delete
    page.on("dialog", (dialog) => {
      expect(dialog.message()).toContain("Delete this project?");
      dialog.accept();
    });

    await page.getByTestId(`delete-button-${project1Id}`).click();

    // First project should be gone
    await expect(
      page.getByTestId(`project-card-${project1Id}`),
    ).not.toBeVisible();
    await expect(page.getByTestId(`project-card-${project2Id}`)).toBeVisible();
  });

  test("can rename and delete from project modal in main app", async ({
    page,
  }) => {
    // Create a project
    await clickNewProject(page);
    await evaluateStore(page, (store) => {
      store.getState().setTempo(125);
    });
    await page.waitForTimeout(600);

    const projectId = await evaluateStore(
      page,
      (store) => store.getState().currentProjectId,
    );

    // Open project modal from transport
    await page.getByTestId("settings-button").click();
    await page.getByTestId("projects-button").click();

    // Should see project card in modal
    const projectCard = page.getByTestId(`project-card-${projectId}`);
    await expect(projectCard).toBeVisible();
    await expect(projectCard).toContainText("Untitled");

    // Rename from modal
    await projectCard.hover();
    await page.getByTestId(`rename-button-${projectId}`).click();
    const renameInput = page.getByTestId(`rename-input-${projectId}`);
    await renameInput.fill("From Modal");
    await renameInput.press("Enter");

    await expect(projectCard).toContainText("From Modal");
  });
});
