import { expect, test } from "@playwright/test";
import { createDefaultSavedProject } from "../src/lib/project-store";

for (const suffix of ["", "/score"]) {
  test(`legacy ${suffix || "editor"} link directs users home for migration`, async ({
    page,
  }) => {
    // Seed a legacy project and open its old bookmark.
    await page.goto("/__e2e__/");
    const projectId = await page.evaluate(
      (project) =>
        window.__e2e.projectStorage.create("Bookmarked song", project),
      createDefaultSavedProject(),
    );
    await page.goto(`/project/${projectId}${suffix}`);
    await expect(
      page.getByText("The legacy editor has been retired.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByTestId("transport")).toHaveCount(0);

    // Follow the notice home and find the original available for manual migration.
    await page.getByRole("link", { name: "Back to projects" }).click();
    await expect(page.getByText("No projects yet")).toBeVisible();
    await page.getByRole("button", { name: "View legacy projects" }).click();
    const legacy = page.getByRole("region", { name: "Legacy projects" });
    await expect(legacy).toContainText("Bookmarked song");
    await expect(
      legacy.getByRole("button", { name: "Migrate to new editor" }),
    ).toBeVisible();
  });
}
