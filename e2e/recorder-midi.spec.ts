import { expect, test } from "@playwright/test";
import { selectMenuItem } from "./helpers";
import {
  createRecorderProject,
  addRecorderMidiTrack,
  createRecorderMidiNote,
  saveRecorderProject,
  getRecorderPosition,
  openRecorderMidiInstrument,
  selectRecorderMidiInstrument,
} from "./recorder-helpers";

test("adds, mixes, saves, plays, and removes MIDI tracks", async ({ page }) => {
  // Add two MIDI tracks and verify each has its own timeline row.
  await createRecorderProject(page);
  const rows = page.getByTestId("recorder-midi-track-row");
  await addRecorderMidiTrack(page);
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toContainText("MIDI 1");
  await addRecorderMidiTrack(page);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("MIDI 2");

  // Mute the first track and solo the second, then verify the mixer reflects both edits.
  await rows.nth(0).getByTitle("Mute MIDI 1", { exact: true }).click();
  await rows.nth(1).getByTitle("Solo MIDI 2", { exact: true }).click();
  await page.getByTestId("recorder-mixer-button").click();
  const firstChannel = page.getByTestId("recorder-mixer-midi-1");
  const secondChannel = page.getByTestId("recorder-mixer-midi-2");
  await expect(
    firstChannel.getByRole("button", { name: "Toggle MIDI 1 mute" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    secondChannel.getByRole("button", { name: "Toggle MIDI 2 solo" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    secondChannel.getByRole("button", { name: "Toggle MIDI 2 mute" }),
  ).toHaveAttribute("aria-pressed", "false");

  // Change the second track's gain in the mixer and verify its timeline control follows.
  const secondLevel = page.getByRole("textbox", { name: "MIDI 2 level in dB" });
  await secondLevel.fill("-6");
  await secondLevel.press("Enter");
  await expect(rows.nth(1)).toContainText("-6.0 dB");

  // Save and reload both tracks with their independent mix settings.
  const save = page.getByTestId("recorder-save-button");
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await saveRecorderProject(page);
  await page.reload();
  await expect(rows).toHaveCount(2);
  await expect(
    rows.nth(0).getByTitle("Unmute MIDI 1", { exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    rows.nth(1).getByTitle("Disable MIDI 2 solo", { exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(rows.nth(1)).toContainText("-6.0 dB");
  await page.getByTestId("recorder-mixer-button").click();
  await expect(secondLevel).toHaveValue("-6.0");

  // Play the restored project and pause after the transport advances.
  const play = page.getByTestId("recorder-play-button");
  await play.click();
  await expect.poll(() => getRecorderPosition(page)).toBeGreaterThan(0);
  await play.click();
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await expect(save).toHaveAttribute("data-status", "saved");

  // Remove the second track and verify its row and mixer channel disappear independently.
  await selectMenuItem(page, { menu: "MIDI 2 actions", item: "Remove track" });
  await expect(rows).toHaveCount(1);
  await expect(secondChannel).toHaveCount(0);
  await expect(firstChannel).toBeVisible();
  await expect(rows.nth(0)).toContainText("MIDI 1");

  // Save the removal and verify the deleted track stays absent after reload.
  await saveRecorderProject(page);
  await page.reload();
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toContainText("MIDI 1");
});

test("creates and deletes a note and persists its instrument", async ({
  page,
}) => {
  // Add an empty MIDI track, check its hint, and preview C4 on its piano keyboard.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  const grid = row.getByTestId("recorder-midi-grid");
  const notes = grid.locator("[data-note-id]");
  const hint = row.getByText("Click the grid to add notes", { exact: true });
  await expect(hint).toBeVisible();
  await expect(grid).toBeVisible();
  await expect(notes).toHaveCount(0);
  const key = row.getByRole("button", { name: "Preview C4", exact: true });
  await key.click();

  // Create a C4 note through the hint overlay and verify its pitch, snapped start, and hidden hint.
  await createRecorderMidiNote(page, row, { beat: 0, pitch: "C4" });
  await expect(hint).toBeHidden();
  await expect(notes).toHaveCount(1);
  await expect(notes.first()).toHaveAttribute("aria-label", "C4, beat 1");

  // Select a bass program through the track actions.
  const instrument = await openRecorderMidiInstrument(page, { name: "MIDI 1" });
  await selectRecorderMidiInstrument(instrument, {
    option: "33: Electric Bass (finger)",
  });
  await instrument.getByRole("button", { name: "Close", exact: true }).click();

  // Save and reload the note and instrument, then reopen the program selector.
  await saveRecorderProject(page);
  await page.reload();
  await expect(notes).toHaveCount(1);
  await expect(notes.first()).toHaveAttribute("aria-label", "C4, beat 1");
  await openRecorderMidiInstrument(page, { name: "MIDI 1" });
  await expect(instrument.getByTestId("instrument-select")).toContainText(
    "33: Electric Bass (finger)",
  );
  await instrument.getByRole("button", { name: "Close", exact: true }).click();

  // Delete the last note to restore the hint, then save and verify the empty state survives reload.
  await notes.first().click();
  await page.keyboard.press("Delete");
  await expect(notes).toHaveCount(0);
  await expect(row).toBeVisible();
  await expect(hint).toBeVisible();
  await saveRecorderProject(page);
  await page.reload();
  await expect(grid).toBeVisible();
  await expect(notes).toHaveCount(0);
  await expect(hint).toBeVisible();
});
