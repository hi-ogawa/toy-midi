import { expect, test } from "@playwright/test";
import { createDefaultSavedProject } from "../src/lib/project-store";

test("home creates and reopens recorder projects without project-type tabs", async ({
  page,
}) => {
  // Open the recorder list directly, even when an old MIDI-tab preference exists.
  await page.goto("/__e2e__/");
  await page.evaluate(() =>
    localStorage.setItem(
      "toy-midi:preferences",
      JSON.stringify({
        projectType: "midi",
        defaultMidiProgram: 24,
      }),
    ),
  );
  await page.goto("/");
  await expect(
    page.getByRole("tab", { name: "Legacy", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Projects", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("new-project-button")).toHaveCount(0);
  await expect(page.getByText("No projects yet")).toBeVisible();

  // Create a recorder project and return home to its saved entry.
  await page.getByTestId("new-recorder-project-button").click();
  await expect(page).toHaveURL(/\/recorder\/[^/]+$/);
  const projectUrl = page.url();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL("/");
  const project = page.locator(`a[href="${new URL(projectUrl).pathname}"]`);
  await expect(project).toBeVisible();

  // Reload home and reopen the same recorder project.
  await page.reload();
  await expect(project).toBeVisible();
  await project.click();
  await expect(page).toHaveURL(projectUrl);
});

test("Projects search filters current and legacy projects together", async ({
  page,
}) => {
  // Seed legacy projects and create a named project in the new editor.
  await page.goto("/__e2e__/");
  await page.evaluate((project) => {
    for (const name of ["Blue archive", "Old song"]) {
      window.__e2e.projectStorage.create(name, project);
    }
  }, createDefaultSavedProject());
  await page.goto("/");
  await page.getByTestId("new-recorder-project-button").click();
  page.once("dialog", (dialog) => dialog.accept("Blue session"));
  await page.getByTestId("recorder-project-name").click();
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Blue session",
  );
  await page.getByTestId("recorder-save-button").click();
  await expect(page.getByTestId("recorder-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Home", exact: true }).click();
  const search = page.getByRole("textbox", { name: "Search projects" });
  const status = page.getByRole("status");
  const current = page.getByRole("link", { name: /Blue session/ });
  const legacy = page.getByRole("region", { name: "Legacy projects" });
  await expect(status).toHaveText("3 of 3 projects");

  // Match names across both lists regardless of case and surrounding spaces.
  await search.fill(" BLUE ");
  await expect(status).toHaveText("2 of 3 projects");
  await expect(current).toBeVisible();
  await expect(legacy).toContainText("Blue archive");
  await expect(legacy).not.toContainText("Old song");

  // Match each list independently and retain the empty section with an explanation.
  await search.fill("session");
  await expect(status).toHaveText("1 of 3 projects");
  await expect(current).toBeVisible();
  await expect(legacy).toContainText("No matching legacy projects");
  await search.fill("archive blue");
  await expect(status).toHaveText("1 of 3 projects");
  await expect(current).toBeHidden();
  await expect(legacy).toContainText("Blue archive");
  await expect(
    page.getByText("No matching projects", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/No projects match/)).toBeHidden();

  // Show compact messages in both sections and clear the search to restore their rows.
  await search.fill("missing");
  await expect(status).toHaveText("0 of 3 projects");
  await expect(
    page.getByText("No matching projects", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/No projects match/)).toBeHidden();
  await expect(legacy).toContainText("No matching legacy projects");
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(search).toBeFocused();
  await expect(status).toHaveText("3 of 3 projects");

  // Delete a matching legacy project and update the combined counts immediately.
  await search.fill("archive");
  page.once("dialog", (dialog) => dialog.accept());
  await legacy.getByRole("button", { name: "Delete legacy project" }).click();
  await expect(status).toHaveText("0 of 2 projects");
  await expect(legacy).toContainText("No matching legacy projects");
  await search.press("Escape");
  await expect(status).toHaveText("2 of 2 projects");

  // Remove the current project and keep searching the remaining legacy project.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete project" }).click();
  await expect(status).toHaveText("1 of 1 projects");
  await expect(legacy).toContainText("Old song");
  await expect(
    page.getByText("No projects yet", { exact: true }),
  ).toBeVisible();
  await search.fill("missing");
  await expect(page.getByText(/No projects match/)).toBeHidden();

  await expect(
    page.getByText("No projects yet", { exact: true }),
  ).toBeVisible();
  await expect(legacy).toContainText("No matching legacy projects");

  // Clear the search and delete the last legacy project to remove its section.
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(legacy).toContainText("Old song");
  page.once("dialog", (dialog) => dialog.accept());
  await legacy.getByRole("button", { name: "Delete legacy project" }).click();
  await expect(legacy).toBeHidden();
  await expect(page.getByRole("status")).toHaveText("0 of 0 projects");
  await expect(
    page.getByText("No projects yet", { exact: true }),
  ).toBeVisible();
});
