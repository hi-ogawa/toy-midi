import { expect, type Page, test } from "@playwright/test";
import { createProject, saveProject } from "./editor-helpers";
import { selectMenuItem } from "./helpers";

test("asks before leaving a project with unsaved edits", async ({ page }) => {
  const prompts = recordUnloadPrompts(page);

  // Create a project, change its tempo, and try to go home.
  await createProject(page);
  const projectUrl = page.url();
  const tempo = page.getByTestId("tempo-input");
  await tempo.fill("90");
  await tempo.press("Enter");
  await selectMenuItem(page, { menu: "Editor menu", item: "Home" });

  // Stay on the project after declining to leave, with the edit kept.
  await expect.poll(() => prompts.length).toBe(1);
  await expect(page).toHaveURL(projectUrl);
  await expect(tempo).toHaveValue("90");

  // Save, and go home without being asked.
  await saveProject(page);
  await selectMenuItem(page, { menu: "Editor menu", item: "Home" });
  await expect(page).toHaveURL("/");
  expect(prompts).toHaveLength(1);
});

test("asks before leaving a draft with unsaved edits", async ({ page }) => {
  const prompts = recordUnloadPrompts(page);

  // Start a new project, and go home without being asked.
  await page.goto("/");
  await page.getByTestId("new-project-button").click();
  await expect(page.getByTestId("draft-badge")).toBeVisible();
  await selectMenuItem(page, { menu: "Editor menu", item: "Home" });
  await expect(page).toHaveURL("/");

  // Start another, change its tempo, and try to go home.
  await page.getByTestId("new-project-button").click();
  const tempo = page.getByTestId("tempo-input");
  await tempo.fill("90");
  await tempo.press("Enter");
  await selectMenuItem(page, { menu: "Editor menu", item: "Home" });

  // Stay on the draft after declining to leave, with the edit kept.
  await expect.poll(() => prompts.length).toBe(1);
  await expect(page.getByTestId("draft-badge")).toBeVisible();
  await expect(tempo).toHaveValue("90");

  // Save, and open the stored project without being asked.
  await page.getByTestId("save-draft-button").click();
  await expect(page).toHaveURL(/\/recorder\/[^/]+$/);
  await expect(tempo).toHaveValue("90");
  expect(prompts).toHaveLength(1);
});

/** Decline every unload prompt, and collect them so a test can count them. */
function recordUnloadPrompts(page: Page) {
  const prompts: string[] = [];
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "beforeunload") {
      prompts.push(dialog.message());
      await dialog.dismiss();
    }
  });
  return prompts;
}
