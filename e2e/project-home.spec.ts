import { expect, test } from "@playwright/test";
import { selectMenuItem } from "./helpers";

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
  await selectMenuItem(page, { menu: "Editor menu", item: "Home" });
  await expect(page).toHaveURL("/");
  const project = page.locator(`a[href="${new URL(projectUrl).pathname}"]`);
  await expect(project).toBeVisible();

  // Reload home and reopen the same recorder project.
  await page.reload();
  await expect(project).toBeVisible();
  await project.click();
  await expect(page).toHaveURL(projectUrl);
});

test("Projects search follows the temporary legacy filter", async ({
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
  await selectMenuItem(page, { menu: "Editor menu", item: "Home" });
  const search = page.getByRole("textbox", { name: "Search projects" });
  const status = page.getByRole("status");
  const current = page.getByRole("link", { name: /Blue session/ });
  const legacy = page.getByRole("region", { name: "Legacy projects" });
  await expect(status).toHaveText("1 project");
  await expect(legacy).toBeHidden();

  // Search current projects without including legacy matches.
  await search.fill(" BLUE ");
  await expect(status).toHaveText("1 of 1 project");
  await expect(current).toBeVisible();
  await search.fill("missing");
  await expect(
    page.getByText("No matching projects", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(search).toBeFocused();

  // Open the legacy filter and search its collection independently.
  await page.getByRole("button", { name: "View legacy projects" }).click();
  await expect(status).toHaveText("2 legacy projects");
  await expect(current).toBeHidden();
  await expect(search).toHaveValue("");
  await search.fill("archive blue");
  await expect(status).toHaveText("1 of 2 legacy projects");
  await expect(legacy).toContainText("Blue archive");
  await expect(legacy).not.toContainText("Old song");

  // Return to current projects and clear the legacy query.
  await page.getByRole("button", { name: "Show current projects" }).click();
  await expect(search).toHaveValue("");
  await expect(current).toBeVisible();
  await page.getByRole("button", { name: "View legacy projects" }).click();

  // Delete a matching legacy project and retain the empty search result.
  await search.fill("archive");
  page.once("dialog", (dialog) => dialog.accept());
  await legacy.getByRole("button", { name: "Delete legacy project" }).click();
  await expect(status).toHaveText("0 of 1 legacy project");
  await expect(legacy).toContainText("No matching legacy projects");
  await expect(
    page.getByText("Migration required for 1 legacy project."),
  ).toBeVisible();
  await search.press("Escape");

  // Delete the final legacy project and return to the current collection.
  page.once("dialog", (dialog) => dialog.accept());
  await legacy.getByRole("button", { name: "Delete legacy project" }).click();
  await expect(legacy).toBeHidden();
  await expect(
    page.getByRole("button", { name: "View legacy projects" }),
  ).toBeHidden();
  await expect(status).toHaveText("1 project");
  await expect(current).toBeVisible();

  // Delete the last current project and show the creation prompt.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete project" }).click();
  await expect(status).toBeHidden();
  await expect(search).toBeHidden();
  await expect(
    page.getByText("No projects yet", { exact: true }),
  ).toBeVisible();
});
