import { expect, test } from "@playwright/test";

test("app loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("piano-roll-grid")).toBeVisible();
});
