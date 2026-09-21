import { expect, test } from "@playwright/test";
import { createRecorderProject, saveRecorderProject } from "./recorder-helpers";

test("assigns available default names after project creation, deletion, and rename", async ({
  page,
}) => {
  // Create three projects with distinct sequential names in the editor and browser tab.
  const name = page.getByTestId("recorder-project-name");
  let secondUrl = "";
  for (const title of ["Untitled", "Untitled 2", "Untitled 3"]) {
    await createRecorderProject(page);
    await expect(name).toHaveText(title);
    await expect(page).toHaveTitle(`${title} - Toy MIDI`);
    if (title === "Untitled 2") {
      secondUrl = page.url();
    }
  }

  // Delete the middle project and reuse its free name without colliding with Untitled 3.
  await page.goto("/");
  const secondLink = page.locator(`a[href="${new URL(secondUrl).pathname}"]`);
  page.once("dialog", (dialog) => dialog.accept());
  await secondLink
    .locator("..")
    .getByRole("button", { name: "Delete project" })
    .click();
  await expect(secondLink).toHaveCount(0);
  await createRecorderProject(page);
  await expect(name).toHaveText("Untitled 2");

  // Rename the replacement to occupy a higher suffix and persist that name.
  page.once("dialog", (dialog) => dialog.accept("Untitled 4"));
  await name.click();
  await expect(name).toHaveText("Untitled 4");
  await saveRecorderProject(page);

  // Fill the freed suffix, then skip all occupied names when creating the next project.
  await createRecorderProject(page);
  await expect(name).toHaveText("Untitled 2");
  await createRecorderProject(page);
  await expect(name).toHaveText("Untitled 5");
  await expect(page).toHaveTitle("Untitled 5 - Toy MIDI");

  // Reload the project list and retain each distinct saved name exactly once.
  await page.goto("/");
  await page.reload();
  for (const title of [
    "Untitled",
    "Untitled 2",
    "Untitled 3",
    "Untitled 4",
    "Untitled 5",
  ]) {
    await expect(
      page
        .locator('a[href^="/recorder/"]')
        .filter({ has: page.getByText(title, { exact: true }) }),
    ).toHaveCount(1);
  }
});
