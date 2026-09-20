import { expect, test } from "@playwright/test";
import {
  addRecorderMidiTrack,
  createRecorderMidiNote,
  createRecorderProject,
  saveRecorderProject,
} from "./recorder-helpers";

test("switches between the MIDI editor and a persistent passive overview", async ({
  page,
}) => {
  // Open an empty overview and keep the checked menu item visible until Escape.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  const actions = row.getByRole("button", { name: "MIDI 1 actions" });
  const toggle = page.getByRole("menuitemcheckbox", {
    name: "Overview",
    exact: true,
  });
  const grid = row.getByTestId("recorder-midi-grid");
  const overview = row.getByRole("img", { name: /MIDI 1 note overview/ });
  await actions.click();
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(toggle).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeHidden();
  await expect(overview).toBeVisible();
  await expect(row.getByText("No notes", { exact: true })).toBeVisible();
  await expect(grid).toHaveCount(0);

  // Return to the editor with the keyboard, then create and copy a selected note.
  await actions.click();
  await toggle.press("Enter");
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeVisible();
  await page.keyboard.press("Escape");
  await createRecorderMidiNote(page, row, { beat: 0, pitch: "C4" });
  await grid.locator("[data-note-id]").click();
  await page.keyboard.press("ControlOrMeta+c");
  const editorHeight = (await row.boundingBox())!.height;

  // Show the note in overview without changing track height or allowing note edits.
  await actions.click();
  await toggle.click();
  await page.keyboard.press("Escape");
  await expect(overview).toHaveAccessibleName("MIDI 1 note overview, 1 note");
  await expect(row.getByText("No notes", { exact: true })).toBeHidden();
  await expect(grid).toHaveCount(0);
  expect((await row.boundingBox())!.height).toBe(editorHeight);
  const box = (await overview.boundingBox())!;
  const note = (await overview.locator(":scope > div").boundingBox())!;
  expect(
    Math.abs(note.y + note.height / 2 - box.y - box.height / 2),
  ).toBeLessThanOrEqual(1);
  await overview.click();
  await page.keyboard.press("Delete");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(overview).toHaveAccessibleName("MIDI 1 note overview, 1 note");

  // Save and reload the overview, then return to the editor and add another note.
  await saveRecorderProject(page);
  await page.reload();
  await expect(overview).toBeVisible();
  await expect(overview).toHaveAccessibleName("MIDI 1 note overview, 1 note");
  await actions.click();
  await expect(toggle).toBeChecked();
  await toggle.click();
  await page.keyboard.press("Escape");
  await expect(grid.locator("[data-note-id]")).toHaveCount(1);
  await createRecorderMidiNote(page, row, { beat: 1, pitch: "D4" });
  await expect(grid.locator("[data-note-id]")).toHaveCount(2);
});
