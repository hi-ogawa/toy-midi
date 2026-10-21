import { expect, test } from "@playwright/test";

test("iterates the multiband EQ preview", async ({ page }) => {
  // Open the preview with three bands and Band 1 selected.
  await page.goto("/_preview?component=effects");
  const panel = page.getByTestId("effects-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("eq-response-point")).toHaveCount(3);
  await expect(panel.getByRole("heading", { name: "Band 1" })).toBeVisible();

  // Click Band 2's handle off its center, which selects the band without
  // moving it.
  const frequencyInput = panel.getByRole("textbox", { name: "Frequency" });
  const gainInput = panel.getByRole("textbox", { name: "Gain", exact: true });
  const point = await panel
    .getByTestId("eq-response-point")
    .nth(1)
    .boundingBox();
  expect(point).toBeTruthy();
  const pointCenter = {
    x: point!.x + point!.width / 2,
    y: point!.y + point!.height / 2,
  };
  await page.mouse.click(pointCenter.x + 6, pointCenter.y + 6);
  await expect(panel.getByRole("heading", { name: "Band 2" })).toBeVisible();
  await expect(frequencyInput).toHaveValue("850");
  await expect(gainInput).toHaveValue("-7");

  // Drag the handle to increase frequency and gain.
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

  // Switch Band 2 to low-pass, which hides its gain and redraws its curve.
  const filterType = panel.getByRole("combobox", { name: "Filter type" });
  const curve = panel.getByTestId("eq-band-curve").nth(1);
  const peakingPath = await curve.getAttribute("d");
  await filterType.selectOption("low-pass");
  await expect(gainInput).toHaveCount(0);
  await expect(curve).not.toHaveAttribute("d", peakingPath!);
  const passPoint = panel.getByTestId("eq-response-point").nth(1);

  // Drag the low-pass handle up and right, which moves only its cutoff.
  const passBox = (await passPoint.boundingBox())!;
  const passCenter = {
    x: passBox.x + passBox.width / 2,
    y: passBox.y + passBox.height / 2,
  };
  await page.mouse.move(passCenter.x, passCenter.y);
  await page.mouse.down();
  await page.mouse.move(passCenter.x + 20, passCenter.y - 20);
  await page.mouse.up();
  await expect
    .poll(async () => Number(await frequencyInput.inputValue()))
    .toBeGreaterThan(Number(frequency));
  const draggedBox = (await passPoint.boundingBox())!;
  expect(draggedBox.x).toBeGreaterThan(passBox.x);
  expect(draggedBox.y).toBeCloseTo(passBox.y, 0);

  // Switch back to peaking, and the band's gain is where it was.
  await filterType.selectOption("peaking");
  await expect(gainInput).toHaveValue(gain);

  // Per-band and global bypass states update their response curves.
  await panel.getByRole("checkbox", { name: "Bypass" }).last().check();
  await expect(panel.getByTestId("eq-band-curve").nth(1)).toHaveAttribute(
    "stroke-dasharray",
  );
  const combinedCurve = panel.getByTestId("eq-combined-curve");
  const opacity = Number(await combinedCurve.getAttribute("stroke-opacity"));
  await panel.getByRole("checkbox", { name: "Bypass" }).first().check();
  await expect
    .poll(async () =>
      Number(await combinedCurve.getAttribute("stroke-opacity")),
    )
    .toBeLessThan(opacity);
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
  await expect(panel.getByTestId("eq-response-point")).toHaveCount(4);
  await expect(panel.getByRole("heading", { name: "Band 4" })).toBeVisible();

  // Delete the selected band to return to three bands.
  await panel.getByRole("button", { name: "Delete band" }).click();
  await expect(panel.getByTestId("eq-response-point")).toHaveCount(3);

  // Reset the EQ to a single selected band.
  await panel.getByRole("button", { name: "Reset EQ" }).click();
  await expect(panel.getByTestId("eq-response-point")).toHaveCount(1);
  await expect(panel.getByRole("heading", { name: "Band 1" })).toBeVisible();
});
