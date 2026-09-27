import { expect, test } from "@playwright/test";

test("requests browser storage protection from home", async ({ page }) => {
  // Open storage management and load the browser's usage and protection status.
  await page.goto("/");
  await page.getByRole("button", { name: "Manage storage" }).click();
  const dialog = page.getByRole("dialog", { name: "Browser storage" });
  await expect(dialog.getByText(/^\d+(\.\d+)? (kB|MB|GB)$/)).toBeVisible();
  await expect(dialog.getByRole("status")).toHaveText(
    /Automatic cleanup protection\s*Off/,
  );

  // Request protection and show the fresh Chromium context's declined outcome.
  await dialog.getByRole("button", { name: "Protect stored projects" }).click();
  await expect(
    dialog.getByText(
      "The browser did not enable protection. You can continue saving and export a backup.",
      { exact: true },
    ),
  ).toBeVisible();

  // Close storage management and return to the project actions.
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "New project", exact: true }),
  ).toBeVisible();
});
