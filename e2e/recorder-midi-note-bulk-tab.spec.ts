import { expect, test } from "@playwright/test";
import { createRecorderProject } from "./recorder-helpers";

test("updates tab strings for selected MIDI notes together", async ({
  page,
}) => {
  await createRecorderProject(page);
  await page.getByTestId("recorder-add-midi-track").click();
  const row = page.getByTestId("recorder-midi-track-row");
  const grid = row.getByTestId("recorder-midi-grid");
  const notes = grid.locator("[data-note-id]");
  const gridBox = (await grid.boundingBox())!;
  const c4Key = row.getByRole("button", { name: "Preview C4", exact: true });
  const e4Key = row.getByRole("button", { name: "Preview E4", exact: true });
  const c4KeyBox = (await c4Key.boundingBox())!;

  await page.mouse.click(gridBox.x + 5, c4KeyBox.y + c4KeyBox.height / 2);
  const cellWidth = (await notes.first().boundingBox())!.width;
  const e4KeyBox = (await e4Key.boundingBox())!;
  await page.mouse.click(
    gridBox.x + cellWidth * 2 + 5,
    e4KeyBox.y + e4KeyBox.height / 2,
  );
  const c4 = grid.locator('[aria-label="C4, beat 1"]');
  const e4 = grid.locator('[aria-label="E4, beat 1.5"]');

  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  await page
    .getByRole("menuitem", { name: "Instrument…", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Show string annotations" }).check();
  await page
    .getByRole("combobox", { name: "Tuning", exact: true })
    .selectOption({ label: "5-string bass (BEADG)" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(c4.getByTestId("tab-annotation")).toHaveText("G17");
  await expect(e4.getByTestId("tab-annotation")).toHaveText("G21");

  await c4.click({ modifiers: ["Control"] });
  await e4.click({ modifiers: ["Control"] });
  await page.keyboard.press("5");
  await expect(c4.getByTestId("tab-annotation")).toHaveText("B37");
  await expect(e4.getByTestId("tab-annotation")).toHaveText("B41");

  await page.keyboard.press("ArrowUp");
  await expect(c4.getByTestId("tab-annotation")).toHaveText("E32");
  await expect(e4.getByTestId("tab-annotation")).toHaveText("E36");

  await page.keyboard.press("0");
  await expect(c4.getByTestId("tab-annotation")).toHaveText("G17");
  await expect(e4.getByTestId("tab-annotation")).toHaveText("G21");

  const save = page.getByTestId("recorder-save-button");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.reload();
  await expect(c4.getByTestId("tab-annotation")).toHaveText("G17");
  await expect(e4.getByTestId("tab-annotation")).toHaveText("G21");
});
