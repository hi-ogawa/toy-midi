import { expect, test } from "@playwright/test";

test("iterates the multiband recorder EQ preview", async ({
  page,
}, testInfo) => {
  // Open the preview with three bands and Band 1 selected.
  await page.goto("/_preview?component=recorder-multiband-effects");
  const panel = page.getByTestId("recorder-multiband-effects-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("multiband-eq-response-point")).toHaveCount(3);
  await expect(panel.getByRole("heading", { name: "Band 1" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("multiband-eq.png") });

  // Select Band 2, then drag its handle to increase frequency and gain.
  await panel.getByRole("button", { name: "Select band 2" }).click();
  await expect(panel.getByRole("heading", { name: "Band 2" })).toBeVisible();
  const frequencyInput = panel.getByRole("textbox", { name: "Frequency" });
  const gainInput = panel.getByRole("textbox", { name: "Gain", exact: true });
  await expect(frequencyInput).toHaveValue("850");
  const point = await panel
    .getByTestId("multiband-eq-response-point")
    .nth(1)
    .boundingBox();
  expect(point).toBeTruthy();
  const pointCenter = {
    x: point!.x + point!.width / 2,
    y: point!.y + point!.height / 2,
  };
  await page.mouse.move(pointCenter.x, pointCenter.y);
  await page.mouse.down();
  await page.mouse.move(pointCenter.x + 30, pointCenter.y - 20);
  await page.mouse.up();
  await expect
    .poll(async () => Number(await frequencyInput.inputValue()))
    .toBeGreaterThan(850);
  await expect
    .poll(async () => Number(await gainInput.inputValue()))
    .toBeGreaterThan(-7);
  const frequency = await frequencyInput.inputValue();
  const gain = await gainInput.inputValue();

  // Wheel over the graph adjusts only the selected band's Q.
  const qInput = panel.getByRole("textbox", { name: "Q", exact: true });
  await page.mouse.wheel(0, 100);
  await expect
    .poll(async () => Number(await qInput.inputValue()))
    .toBeGreaterThan(2.4);
  await page.mouse.wheel(0, -100);
  await expect(qInput).toHaveValue("2.4");
  await expect(frequencyInput).toHaveValue(frequency);
  await expect(gainInput).toHaveValue(gain);

  // Per-band and global bypass states update their response curves.
  await panel.getByRole("checkbox", { name: "Bypass" }).last().check();
  await expect(
    panel.getByTestId("multiband-eq-band-curve").nth(1),
  ).toHaveAttribute("stroke-dasharray", "3 3");
  await panel.getByRole("checkbox", { name: "Bypass" }).first().check();
  await expect(
    panel.getByTestId("multiband-eq-combined-curve"),
  ).toHaveAttribute("stroke-opacity", "0.25");
  await panel.getByRole("checkbox", { name: "Bypass" }).first().uncheck();

  // Optional sliders can be shown and hidden beside the graph controls.
  await expect(panel.getByRole("slider")).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Show sliders", exact: true })
    .click();
  await expect(panel.getByRole("slider")).toHaveCount(3);
  await panel
    .getByRole("button", { name: "Hide sliders", exact: true })
    .click();
  await expect(panel.getByRole("slider")).toHaveCount(0);

  // Add a fourth band and verify that it becomes the selected band.
  await panel.getByRole("button", { name: "Add band" }).click();
  await expect(panel.getByTestId("multiband-eq-response-point")).toHaveCount(4);
  await expect(panel.getByRole("heading", { name: "Band 4" })).toBeVisible();

  // Delete the selected band to return to three bands.
  await panel.getByRole("button", { name: "Delete band" }).click();
  await expect(panel.getByTestId("multiband-eq-response-point")).toHaveCount(3);

  // Reset the EQ to a single selected band.
  await panel.getByRole("button", { name: "Reset EQ" }).click();
  await expect(panel.getByTestId("multiband-eq-response-point")).toHaveCount(1);
  await expect(panel.getByRole("heading", { name: "Band 1" })).toBeVisible();
});
