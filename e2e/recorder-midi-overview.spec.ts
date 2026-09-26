import { expect, test } from "@playwright/test";
import {
  addRecorderMidiTrack,
  createRecorderMidiNote,
  createRecorderProject,
  saveRecorderProject,
} from "./recorder-helpers";

test("switches MIDI views and persists overview mode", async ({ page }) => {
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
  await expect(overview.getByTestId("recorder-midi-octave-guide")).toHaveCount(
    0,
  );
  await expect(grid).toHaveCount(0);

  // Return to the editor using Enter and create a note.
  await actions.click();
  await toggle.press("Enter");
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeVisible();
  await page.keyboard.press("Escape");
  await createRecorderMidiNote(page, row, { beat: 0, pitch: "C4" });

  // Switch to overview and orient the note between two labeled C octave guides.
  await actions.click();
  await toggle.click();
  await page.keyboard.press("Escape");
  await expect(overview).toHaveAccessibleName("MIDI 1 note overview, 1 note");
  await expect(row.getByText("No notes", { exact: true })).toBeHidden();
  const octaveGuides = overview.getByTestId("recorder-midi-octave-guide");
  await expect(octaveGuides).toHaveText(["C4", "C5"]);
  await expect(octaveGuides.nth(0)).toHaveAttribute("data-pitch", "60");
  await expect(octaveGuides.nth(1)).toHaveAttribute("data-pitch", "72");
  await expect(grid).toHaveCount(0);

  // Save and reload the project with overview mode still selected.
  await saveRecorderProject(page);
  await page.reload();
  await expect(overview).toBeVisible();
  await expect(overview).toHaveAccessibleName("MIDI 1 note overview, 1 note");
  await actions.click();
  await expect(toggle).toBeChecked();
});
