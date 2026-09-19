import { expect, test } from "@playwright/test";
import { createDefaultSavedProject } from "../src/lib/project-store";

for (const suffix of ["", "/score"]) {
  test(`legacy ${suffix || "editor"} link selects its project for manual migration`, async ({
    page,
  }) => {
    // Seed two projects so the bookmark must select the requested one.
    await page.goto("/__e2e__/");
    const projectId = await page.evaluate((project) => {
      window.__e2e.projectStorage.create("Other legacy song", project);
      return window.__e2e.projectStorage.create("Bookmarked song", project);
    }, createDefaultSavedProject());

    // Open the old URL without initializing an editor or creating a recorder copy.
    const legacyUrl = `/project/${projectId}${suffix}`;
    await page.goto(legacyUrl);
    const legacy = page.getByRole("region", { name: "Legacy projects" });
    await expect(legacy).toContainText("Bookmarked song");
    await expect(legacy).not.toContainText("Other legacy song");
    await expect(legacy.locator('[aria-current="true"]')).toContainText(
      "Bookmarked song",
    );
    await expect(page.getByTestId("transport")).toHaveCount(0);
    await expect(page.getByTestId("recorder-project-name")).toHaveCount(0);
    await page.getByRole("link", { name: "Back to projects" }).click();
    await expect(page.getByText("No projects yet")).toBeVisible();

    // Explicitly migrate the selected project and open its recorder copy.
    await page.goto(legacyUrl);
    await legacy.getByRole("button", { name: "Migrate to new editor" }).click();
    await expect(page).toHaveURL(/\/recorder\/[^/]+$/);
    const copyUrl = page.url();
    await expect(page.getByTestId("recorder-project-name")).toHaveText(
      "Bookmarked song",
    );

    // Revisit the old bookmark and retain the manual migration screen and original.
    await page.goto(legacyUrl);
    await expect(legacy).toContainText("Bookmarked song");
    await expect(
      legacy.getByRole("button", { name: "Migrate to new editor" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Back to projects" }).click();
    await expect(
      page.locator(`a[href="${new URL(copyUrl).pathname}"]`),
    ).toBeVisible();
  });

  test(`missing legacy ${suffix || "editor"} link offers a path back home`, async ({
    page,
  }) => {
    // Open a missing legacy project and recover through the shared project home.
    await page.goto(`/project/missing${suffix}`);
    await expect(page.getByRole("alert")).toHaveText(
      "Legacy project not found.",
    );
    await expect(
      page.getByRole("button", { name: "Migrate to new editor" }),
    ).toHaveCount(0);
    await page.getByRole("link", { name: "Back to projects" }).click();
    await expect(page.getByTestId("new-recorder-project-button")).toBeVisible();
  });
}
