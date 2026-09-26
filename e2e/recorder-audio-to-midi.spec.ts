import { expect, test } from "@playwright/test";
import { selectMenuItem, createCheckpoint } from "./helpers";
import {
  addRecorderAudio,
  createRecorderProject,
  addRecorderMidiTrack,
  createRecorderMidiNote,
  saveRecorderProject,
} from "./recorder-helpers";

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
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Audio to MIDI" });
  const panel = page.getByTestId("recorder-audio-to-midi");
  await panel
    .getByRole("combobox", { name: "Source audio track" })
    .selectOption({ label: "Audio 2" });
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

test("cancels transcription, closes an active retry, and undoes a successful retry", async ({
  page,
}) => {
  // Gate model loading so both cancellations occur during active conversions.
  const gate = Promise.withResolvers<void>();
  let requests = 0;
  await page.route("**/bass_pitch_bg*.wasm", async (route) => {
    requests++;
    await gate.promise;
    await route.continue();
  });
  await createRecorderProject(page);
  await addRecorderAudio(page, "e2e/fixtures/test-tones.wav");
  const row = await addRecorderMidiTrack(page);
  const original = await createRecorderMidiNote(page, row, {
    beat: 1,
    pitch: "D4",
  });
  const originalId = await original.getAttribute("data-note-id");
  const notes = row.locator("[data-note-id]");
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Audio to MIDI" });
  const panel = page.getByTestId("recorder-audio-to-midi");
  const convert = panel.getByRole("button", {
    name: "Convert to MIDI",
    exact: true,
  });
  await expect.poll(() => requests).toBe(1);

  // Cancel without replacing the destination note or showing an error toast.
  await convert.click();
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("Conversion cancelled");
  await expect(notes).toHaveCount(1);
  await expect(original).toHaveAttribute("data-note-id", originalId!);
  await expect(
    page.locator('[data-sonner-toast][data-type="error"]'),
  ).toHaveCount(0);

  // Start a second conversion and close the panel while model loading is blocked.
  await convert.click();
  await expect.poll(() => requests).toBe(2);
  await panel.getByRole("button", { name: "Close Audio to MIDI" }).click();
  await expect(panel).toHaveCount(0);

  // Release model loading and reopen the panel with the original note still intact.
  gate.resolve();
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Audio to MIDI" });
  await expect.poll(() => requests).toBe(3);
  await expect(notes).toHaveCount(1);
  await expect(original).toHaveAttribute("data-note-id", originalId!);
  await expect(
    page.locator('[data-sonner-toast][data-type="error"]'),
  ).toHaveCount(0);

  // Click Convert to MIDI again and replace the original note after successful transcription.
  const checkpoint = createCheckpoint();
  await convert.click();
  await expect(panel.getByRole("status")).toHaveText(
    /^Created [1-9]\d* notes in MIDI 1\.$/,
  );
  checkpoint("transcription retry completed");
  await expect(original).toHaveCount(0);

  // Close the panel and undo once to restore the original note.
  await panel.getByRole("button", { name: "Close Audio to MIDI" }).click();
  await page.keyboard.press("Control+z");
  await expect(notes).toHaveCount(1);
  await expect(original).toHaveAttribute("data-note-id", originalId!);
});
