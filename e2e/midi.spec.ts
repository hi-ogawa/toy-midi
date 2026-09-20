import { expect, test } from "@playwright/test";
import {
  addRecorderAudio,
  createRecorderProject,
  addRecorderMidiTrack,
  createRecorderMidiNote,
  saveRecorderProject,
  getRecorderPosition,
} from "./editor-helpers";
import { createCheckpoint } from "./helpers";

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
  await rows
    .nth(1)
    .getByRole("button", { name: "MIDI 2 actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Remove track", exact: true })
    .click();
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
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  await page
    .getByRole("menuitem", { name: "Instrument…", exact: true })
    .click();
  const instrument = page.getByRole("combobox", { name: "MIDI 1 program" });
  await instrument.click();
  await page.getByPlaceholder("Search instruments...").fill("Finger");
  await page
    .getByRole("option", { name: "33: Electric Bass (finger)", exact: true })
    .click();
  await expect(instrument).toContainText("33: Electric Bass (finger)");
  await page.getByRole("button", { name: "Close", exact: true }).click();

  // Save and reload the note and instrument, then reopen the program selector.
  await saveRecorderProject(page);
  await page.reload();
  await expect(notes).toHaveCount(1);
  await expect(notes.first()).toHaveAttribute("aria-label", "C4, beat 1");
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  await page
    .getByRole("menuitem", { name: "Instrument…", exact: true })
    .click();
  await expect(instrument).toContainText("33: Electric Bass (finger)");
  await page.getByRole("button", { name: "Close", exact: true }).click();

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

test("transcribes an audio track into MIDI and restores the generated notes", async ({
  page,
}) => {
  // Load the known four-note audio fixture and add an empty destination MIDI track.
  await createRecorderProject(page);
  await addRecorderAudio(page, "e2e/fixtures/test-tones.wav");
  const row = await addRecorderMidiTrack(page);
  const notes = row.locator("[data-note-id]");
  await expect(row).toBeVisible();
  await expect(notes).toHaveCount(0);

  // Choose the imported source and run the real transcription worker.
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  await page
    .getByRole("menuitem", { name: "Audio to MIDI", exact: true })
    .click();
  const panel = page.getByTestId("recorder-audio-to-midi");
  await panel
    .getByRole("combobox", { name: "Source audio track" })
    .selectOption({ label: "Audio 1 · test-tones.wav" });
  const checkpoint = createCheckpoint();
  await panel
    .getByRole("button", { name: "Convert to MIDI", exact: true })
    .click();
  await expect(panel.getByRole("status")).toHaveText(
    /^Created [1-9]\d* notes in MIDI 1\.$/,
  );
  checkpoint("transcription completed");

  // Verify the detected pitches and retain their timeline positions for the reload check.
  const createdCount = Number(
    (await panel.getByRole("status").innerText()).match(/Created (\d+)/)![1],
  );
  await expect(notes).toHaveCount(createdCount);
  const labels = await notes.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-label")),
  );
  // C5 is above the bass detector's 400 Hz ceiling.
  expect([...new Set(labels.map((label) => label!.split(",")[0]))]).toEqual([
    "C4",
    "E4",
    "G4",
  ]);
  for (const label of labels) {
    const beat = Number(label!.split("beat ")[1]);
    expect(beat * 4).toBe(Math.round(beat * 4));
  }
  await panel.getByRole("button", { name: "Close Audio to MIDI" }).click();

  // Save and reload the generated notes alongside their source audio.
  await saveRecorderProject(page);
  await page.reload();
  await expect(notes).toHaveCount(createdCount);
  expect(
    await notes.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("aria-label")),
    ),
  ).toEqual(labels);
  await expect(page.getByTestId("recorder-clip-audio")).toContainText(
    "test-tones.wav",
  );
});
