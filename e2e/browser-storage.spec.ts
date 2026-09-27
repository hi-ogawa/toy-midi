import { expect, test } from "@playwright/test";

test("opens browser storage management from home", async ({ page }) => {
  // Open storage management and load the browser's usage and protection status.
  await page.goto("/");
  await page.getByRole("button", { name: "Manage storage" }).click();
  const dialog = page.getByRole("dialog", { name: "Browser storage" });
  await expect(dialog.getByText(/^\d+(\.\d+)? (kB|MB|GB)$/)).toBeVisible();
  await expect(dialog.getByRole("status")).toHaveText(
    /Automatic cleanup protection\s*(On|Off)/,
  );

  // Close storage management and return to the project actions.
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "New project", exact: true }),
  ).toBeVisible();
});
