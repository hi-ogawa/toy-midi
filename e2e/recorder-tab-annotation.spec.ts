import { expect, test } from "@playwright/test";
import { createRecorderProject } from "./recorder-helpers";

test("assigns MIDI note strings and persists annotation settings", async ({
  page,
}) => {
  // Create a C4 note at the first grid cell with annotations initially hidden.
  await createRecorderProject(page);
  await page.getByTestId("recorder-add-midi-track").click();
  const row = page.getByTestId("recorder-midi-track-row");
  const grid = row.getByTestId("recorder-midi-grid");
  const note = grid.locator("[data-note-id]");
  const annotation = note.getByTestId("tab-annotation");
  const key = row.getByRole("button", { name: "Preview C4", exact: true });
  await expect(key).toBeVisible();
  const gridBox = (await grid.boundingBox())!;
  const keyBox = (await key.boundingBox())!;
  await page.mouse.click(gridBox.x + 5, keyBox.y + keyBox.height / 2);
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1");
  await expect(annotation).toHaveCount(0);
  const originalWidth = (await note.boundingBox())!.width;

  // Enable annotations and choose five-string bass tuning to expose the fifth string.
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  await page
    .getByRole("menuitem", { name: "Instrument…", exact: true })
    .click();
  const enabled = page.getByRole("checkbox", {
    name: "Show string annotations",
  });
  const tuning = page.getByRole("combobox", { name: "Tuning", exact: true });
  await enabled.check();
  await tuning.selectOption({ label: "5-string bass (BEADG)" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(annotation).toHaveText("G17");

  // Assign the fifth string and verify only the string label changes.
  await note.click();
  await page.keyboard.press("5");
  await expect(annotation).toHaveText("B37");
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1");
  expect((await note.boundingBox())!.width).toBe(originalWidth);

  // Return to automatic assignment without changing the note's pitch or timing.
  await page.keyboard.press("0");
  await expect(annotation).toHaveText("G17");
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1");
  expect((await note.boundingBox())!.width).toBe(originalWidth);

  // Save and reload to verify the automatic label, annotation toggle, and tuning persist.
  const save = page.getByTestId("recorder-save-button");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.reload();
  await expect(annotation).toHaveText("G17");
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1");
  expect((await note.boundingBox())!.width).toBe(originalWidth);
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  await page
    .getByRole("menuitem", { name: "Instrument…", exact: true })
    .click();
  await expect(enabled).toBeChecked();
  await expect(tuning).toHaveValue("fiveStringBass");
});
