import { expect, test } from "@playwright/test";

test("iterates the multiband recorder EQ preview", async ({
  page,
}, testInfo) => {
  await page.goto("/_preview?component=recorder-effects");
  const panel = page.getByTestId("recorder-multiband-effects-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("multiband-eq-response-point")).toHaveCount(3);
  await expect(panel.getByRole("heading", { name: "Band 1" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("multiband-eq.png") });

  await panel.getByRole("button", { name: "Select band 2" }).click();
  await expect(panel.getByRole("heading", { name: "Band 2" })).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Frequency" })).toHaveValue(
    "850",
  );
  await panel.getByRole("checkbox", { name: "Bypass" }).last().check();
  await expect(
    panel.getByTestId("multiband-eq-band-curve").nth(1),
  ).toHaveAttribute("stroke-dasharray", "3 3");

  await panel.getByRole("button", { name: "Add band" }).click();
  await expect(panel.getByTestId("multiband-eq-response-point")).toHaveCount(4);
  await expect(panel.getByRole("heading", { name: "Band 4" })).toBeVisible();
  await panel.getByRole("button", { name: "Move band left" }).click();
  await expect(panel.getByRole("heading", { name: "Band 3" })).toBeVisible();
  await panel.getByRole("button", { name: "Delete band" }).click();
  await expect(panel.getByTestId("multiband-eq-response-point")).toHaveCount(3);

  await panel.getByRole("button", { name: "Reset EQ" }).click();
  await expect(panel.getByTestId("multiband-eq-response-point")).toHaveCount(1);
  await expect(panel.getByRole("heading", { name: "Band 1" })).toBeVisible();
});
