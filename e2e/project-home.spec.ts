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
