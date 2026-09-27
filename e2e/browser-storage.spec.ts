import { expect, test } from "@playwright/test";

test("manages storage protection and refreshes usage when reopened", async ({
  page,
}) => {
  // Open storage management and show usage before protection is enabled.
  await page.addInitScript(() => {
    let persisted = false;
    navigator.storage.persisted = async () => persisted;
    navigator.storage.persist = async () => {
      persisted = true;
      return true;
    };
    navigator.storage.estimate = async () => ({ usage: 3_900_000_000 });
  });
  await page.goto("/");
  const manage = page.getByRole("button", { name: "Manage storage" });
  await manage.click();
  const dialog = page.getByRole("dialog", { name: "Browser storage" });
  await expect(dialog.getByText("3.9 GB", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("status")).toContainText("Off");
  expect(await page.evaluate(() => navigator.storage.persisted())).toBe(false);

  // Request protection explicitly and replace the action with the enabled status.
  const protect = dialog.getByRole("button", {
    name: "Protect stored projects",
  });
  await protect.click();
  await expect(dialog.getByRole("status")).toContainText("On");
  await expect(protect).toBeHidden();
  expect(await page.evaluate(() => navigator.storage.persisted())).toBe(true);

  // Reopen after storage usage changes and fetch the updated estimate.
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.evaluate(() => {
    navigator.storage.estimate = async () => ({ usage: 2_400_000_000 });
  });
  await manage.click();
  await expect(dialog.getByText("2.4 GB", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("status")).toContainText("On");
});
