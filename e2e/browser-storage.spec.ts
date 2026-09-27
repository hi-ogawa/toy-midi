import { expect, test } from "@playwright/test";

test("requests browser storage protection from home", async ({ page }) => {
  // Open storage management and load the browser's usage and protection status.
  await page.goto("/");
  await page.getByRole("button", { name: "Manage storage" }).click();
  const dialog = page.getByRole("dialog", { name: "Browser storage" });
  await expect(dialog.getByText(/^\d+(\.\d+)? (kB|MB|GB)$/)).toBeVisible();
  await expect(
    dialog.getByRole("heading", {
      name: "Not protected from automatic cleanup",
    }),
  ).toBeVisible();

  // Request protection and show the fresh Chromium context's declined outcome.
  await dialog.getByRole("button", { name: "Request protection" }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "The browser did not enable protection. You can still save projects.",
  );

  // Close storage management and return to the project actions.
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "New project", exact: true }),
  ).toBeVisible();
});
