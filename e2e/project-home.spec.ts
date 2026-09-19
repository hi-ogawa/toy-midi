import { expect, test } from "@playwright/test";
import { clickNewProject } from "./helpers";

test("project tabs persist across reloads", async ({ page }) => {
  // A first visit shows Projects first and selects the new editor's empty list.
  await page.goto("/");
  const legacy = page.getByRole("tab", { name: "Legacy", exact: true });
  const projects = page.getByRole("tab", { name: "Projects", exact: true });
  await expect(page.getByRole("tab")).toHaveText(["Projects", "Legacy"]);
  await expect(projects).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("No projects yet")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New project", exact: true }),
  ).toBeVisible();

  // Select Legacy and retain that choice after reloading.
  await legacy.click();
  await expect(page.getByText("No legacy projects yet")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New legacy project", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(legacy).toHaveAttribute("aria-selected", "true");

  // Return to Projects and retain that choice on the next visit.
  await projects.click();
  await page.reload();
  await expect(projects).toHaveAttribute("aria-selected", "true");
});

test("both editors return to the shared project home", async ({ page }) => {
  // Create a MIDI project from the shared home.
  await page.goto("/");
  await clickNewProject(page);
  const midiUrl = page.url();

  // The editor's Home action returns to Legacy with the new project listed.
  await page.getByTestId("app-menu-button").click();
  await page.getByRole("menuitem", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("tab", { name: "Legacy", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.locator(`a[href="${new URL(midiUrl).pathname}"]`),
  ).toBeVisible();

  // Switch workflows and create a recorder project from the same page.
  await page.getByRole("tab", { name: "Projects", exact: true }).click();
  await page.getByTestId("new-recorder-project-button").click();
  await expect(page).toHaveURL(/\/recorder\/[^/]+$/);
  const recorderUrl = page.url();

  // The recorder's Home action restores its list, with MIDI projects hidden.
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("tab", { name: "Projects", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const recording = page.locator(`a[href="${new URL(recorderUrl).pathname}"]`);
  await expect(recording).toBeVisible();
  await expect(
    page.locator(`a[href="${new URL(midiUrl).pathname}"]`),
  ).toHaveCount(0);

  // Opening the listed recording returns to that same project.
  await recording.click();
  await expect(page).toHaveURL(recorderUrl);
});

test("Projects search filters current and legacy projects together", async ({
  page,
}) => {
  // Seed legacy projects and create a named project in the new editor.
  await page.goto("/__e2e__/");
  await page.evaluate(() => {
    for (const name of ["Blue archive", "Old song"]) {
      const id = window.__e2e.projectStorage.createNew();
      window.__e2e.projectStorage.updateMetadata(id, { name });
    }
  });
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

  // Open Legacy and show its full list without a search field.
  await page.getByRole("tab", { name: "Legacy", exact: true }).click();
  await expect(search).toBeHidden();
  await expect(page.getByRole("link", { name: /Old song/ })).toBeVisible();
});

test("Projects hides the legacy section only when no saved legacy projects remain", async ({
  page,
}) => {
  // Seed a legacy project and show its migration section even when search excludes it.
  await page.goto("/__e2e__/");
  await page.evaluate(() => window.__e2e.projectStorage.createNew());
  await page.goto("/");
  const search = page.getByRole("textbox", { name: "Search projects" });
  const legacy = page.getByRole("region", { name: "Legacy projects" });
  await search.fill("missing");
  await expect(legacy).toContainText("No matching legacy projects");

  // Clear search and delete the last saved legacy project to remove the section.
  await search.press("Escape");
  page.once("dialog", (dialog) => dialog.accept());
  await legacy.getByRole("button", { name: "Delete legacy project" }).click();
  await expect(legacy).toBeHidden();
  await expect(page.getByRole("status")).toHaveText("0 of 0 projects");
  await expect(
    page.getByText("No projects yet", { exact: true }),
  ).toBeVisible();
});
