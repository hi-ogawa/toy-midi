import { expect, test } from "@playwright/test";

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
    page.getByRole("tab", { name: "MIDI", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Recorder", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("new-project-button")).toHaveCount(0);
  await expect(page.getByText("No recorder projects yet")).toBeVisible();

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
