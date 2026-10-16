import { expect, test } from "@playwright/test";
import {
  createProject,
  dragBy,
  addMidiTrack,
  createMidiNote,
  saveProject,
  getPosition,
  openMidiInstrument,
  selectMidiInstrument,
} from "./editor-helpers";
import { selectMenuItem } from "./helpers";

test("adds, mixes, saves, plays, and removes MIDI tracks", async ({ page }) => {
  // Add two MIDI tracks and verify each has its own timeline row.
  await createProject(page);
  const rows = page.getByTestId("midi-track-row");
  await addMidiTrack(page);
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toContainText("MIDI 1");
  await addMidiTrack(page);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("MIDI 2");

  // Mute the first track and solo the second, then verify the mixer reflects both edits.
  await rows.nth(0).getByTitle("Mute MIDI 1", { exact: true }).click();
  await rows.nth(1).getByTitle("Solo MIDI 2", { exact: true }).click();
  await page.getByTestId("mixer-button").click();
  const firstChannel = page.getByTestId("mixer-midi-1");
  const secondChannel = page.getByTestId("mixer-midi-2");
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

  // Turn the second track's pan knob down to hard left, then step it back to L90.
  const secondPan = secondChannel.getByRole("slider", { name: "MIDI 2 pan" });
  await dragBy(page, secondPan, 0, { deltaY: 300 });
  await expect(secondPan).toHaveAttribute("aria-valuetext", "L100");
  await secondPan.press("Shift+ArrowRight");
  await expect(secondChannel).toContainText("L90");

  // Save and reload both tracks with their independent mix settings.
  const save = page.getByTestId("save-button");
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await saveProject(page);
  await page.reload();
  await expect(rows).toHaveCount(2);
  await expect(
    rows.nth(0).getByTitle("Unmute MIDI 1", { exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    rows.nth(1).getByTitle("Disable MIDI 2 solo", { exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(rows.nth(1)).toContainText("-6.0 dB");
  await expect(secondLevel).toHaveValue("-6.0");
  await expect(secondPan).toHaveAttribute("aria-valuetext", "L90");

  // Play the restored project and pause after the transport advances.
  const play = page.getByTestId("play-button");
  await play.click();
  await expect.poll(() => getPosition(page)).toBeGreaterThan(0);
  await play.click();
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await expect(save).toHaveAttribute("data-status", "saved");

  // Remove the second track and verify its row and mixer channel disappear independently.
  await selectMenuItem(page, { menu: "MIDI 2 actions", item: "Remove track" });
  await expect(rows).toHaveCount(1);
  await expect(secondChannel).toHaveCount(0);
  await expect(firstChannel).toBeVisible();
  await expect(rows.nth(0)).toContainText("MIDI 1");

  // Rename the remaining track, where a blank name keeps the current one.
  page.once("dialog", (dialog) => dialog.accept("   "));
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Rename…" });
  await expect(rows.nth(0)).toContainText("MIDI 1");
  page.once("dialog", (dialog) => dialog.accept("Lead"));
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Rename…" });
  await expect(rows.nth(0)).toContainText("Lead");
  await expect(
    page.getByRole("button", { name: "Toggle Lead mute" }),
  ).toBeVisible();

  // Save the removal and rename, and verify both survive reload.
  await saveProject(page);
  await page.reload();
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toContainText("Lead");
});

test("creates and deletes a note and persists its instrument", async ({
  page,
}) => {
  // Add an empty MIDI track, check its hint, and preview C4 on its piano keyboard.
  await createProject(page);
  const row = await addMidiTrack(page);
  const grid = row.getByTestId("midi-grid");
  const notes = grid.locator("[data-note-id]");
  const hint = row.getByText("Click the grid to add notes", { exact: true });
  await expect(hint).toBeVisible();
  await expect(grid).toBeVisible();
  await expect(notes).toHaveCount(0);
  const key = row.getByRole("button", { name: "Preview C4", exact: true });
  await key.click();

  // Create a C4 note through the hint overlay and verify its pitch, snapped start, and hidden hint.
  await createMidiNote(page, row, { beat: 0, pitch: "C4" });
  await expect(hint).toBeHidden();
  await expect(notes).toHaveCount(1);
  await expect(notes.first()).toHaveAttribute("aria-label", "C4, beat 1");

  // Select a bass program through the track actions.
  const instrument = await openMidiInstrument(page, { name: "MIDI 1" });
  await selectMidiInstrument(instrument, {
    option: "33: Electric Bass (finger)",
  });
  await instrument.getByRole("button", { name: "Close", exact: true }).click();

  // Save and reload the note and instrument, then reopen the program selector.
  await saveProject(page);
  await page.reload();
  await expect(notes).toHaveCount(1);
  await expect(notes.first()).toHaveAttribute("aria-label", "C4, beat 1");
  await openMidiInstrument(page, { name: "MIDI 1" });
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
  await saveProject(page);
  await page.reload();
  await expect(grid).toBeVisible();
  await expect(notes).toHaveCount(0);
  await expect(hint).toBeVisible();
});

test("plays a MIDI track as a drum kit and persists it", async ({ page }) => {
  // Select the TR-808 drum kit through the track actions.
  await createProject(page);
  await addMidiTrack(page);
  const instrument = await openMidiInstrument(page, { name: "MIDI 1" });
  await selectMidiInstrument(instrument, {
    option: "Drums 25: TR-808",
  });
  await instrument.getByRole("button", { name: "Close", exact: true }).click();

  // Save and reload, then verify the drum kit persists.
  await saveProject(page);
  await page.reload();
  await openMidiInstrument(page, { name: "MIDI 1" });
  await expect(instrument.getByTestId("instrument-select")).toContainText(
    "Drums 25: TR-808",
  );

  // Switch back to the melodic program with the same number, and verify it
  // persists after reload.
  await selectMidiInstrument(instrument, {
    option: "25: Acoustic Guitar (steel)",
  });
  await instrument.getByRole("button", { name: "Close", exact: true }).click();
  await saveProject(page);
  await page.reload();
  await openMidiInstrument(page, { name: "MIDI 1" });
  await expect(instrument.getByTestId("instrument-select")).toContainText(
    "25: Acoustic Guitar (steel)",
  );
});

test("plays a MIDI track on the Telecaster SoundFont and persists it", async ({
  page,
}) => {
  // Select the Telecaster's muted preset through the track actions.
  await createProject(page);
  await addMidiTrack(page);
  const instrument = await openMidiInstrument(page, { name: "MIDI 1" });
  await selectMidiInstrument(instrument, { option: "Telecaster: Muted" });
  await instrument.getByRole("button", { name: "Close", exact: true }).click();

  // Save and reload, then verify the Telecaster preset persists.
  await saveProject(page);
  await page.reload();
  await openMidiInstrument(page, { name: "MIDI 1" });
  await expect(instrument.getByTestId("instrument-select")).toContainText(
    "Telecaster: Muted",
  );

  // Switch to the General MIDI program with the same number.
  await selectMidiInstrument(instrument, {
    option: "1: Bright Acoustic Piano",
  });
});

test("scrolls the instrument picker list with the mouse wheel", async ({
  page,
}) => {
  // Open the instrument picker from the MIDI track's instrument dialog.
  await createProject(page);
  await addMidiTrack(page);
  const instrument = await openMidiInstrument(page, { name: "MIDI 1" });
  await instrument.getByTestId("instrument-select").click();
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();

  // Scroll the wheel over the list, and verify the list scrolls.
  await list.hover();
  await page.mouse.wheel(0, 400);
  await expect
    .poll(() => list.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
});
