import { test } from "@playwright/test";

test("capture multipage score PDF", async ({ page }) => {
  await page.goto("/score-viewer");
  await page.getByRole("button", { name: "Samples" }).click();
  await page.getByRole("menuitem", { name: /Print multipage/ }).click();
  await page
    .getByTestId("score-viewer-renderer")
    .locator("svg")
    .first()
    .waitFor();
  await page.getByRole("button", { name: "Print" }).click();
  await page
    .getByTestId("score-viewer-print-renderer")
    .locator("svg")
    .first()
    .waitFor({ state: "attached" });

  await page.pdf({
    path: ".tmp/score-viewer-print.pdf",
    format: "A4",
    printBackground: true,
  });
});
