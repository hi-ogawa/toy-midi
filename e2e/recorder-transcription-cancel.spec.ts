import { expect, test } from "@playwright/test";
import { createCheckpoint } from "./helpers";
import { addRecorderAudio, createRecorderProject } from "./recorder-helpers";

test("cancels recorder transcription on request and panel close, then retries", async ({
  page,
}) => {
  // Hold model loading so each cancellation happens during an active conversion.
  const modelGate = Promise.withResolvers<void>();
  let modelRequests = 0;
  await page.route("**/bass_pitch_bg.wasm", async (route) => {
    modelRequests += 1;
    await modelGate.promise;
    await route.continue();
  });

  // Load audio and create a destination note that cancellation must preserve.
  await createRecorderProject(page);
  await addRecorderAudio(page, "e2e/fixtures/test-tones.wav");
  await page.getByTestId("recorder-add-midi-track").click();
  const row = page.getByTestId("recorder-midi-track-row");
  const grid = row.getByTestId("recorder-midi-grid");
  const notes = grid.locator("[data-note-id]");
  const gridBox = await grid.boundingBox();
  const keyBox = await row
    .getByRole("button", { name: "Preview C4", exact: true })
    .boundingBox();
  await page.mouse.click(gridBox!.x + 5, keyBox!.y + keyBox!.height / 2);
  await expect(notes).toHaveCount(1);
  await expect(notes.first()).toHaveAttribute("aria-label", "C4, beat 1");
  const originalId = await notes.first().getAttribute("data-note-id");

  // Start and cancel conversion while the worker loads, keeping the existing note.
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  await page
    .getByRole("menuitem", { name: "Audio to MIDI", exact: true })
    .click();
  const panel = page.getByTestId("recorder-audio-to-midi");
  const convert = panel.getByRole("button", {
    name: "Convert to MIDI",
    exact: true,
  });
  await expect.poll(() => modelRequests).toBe(1);
  await convert.click();
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("Conversion cancelled");
  await expect(convert).toBeEnabled();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  await expect(notes).toHaveCount(1);
  await expect(notes.first()).toHaveAttribute("data-note-id", originalId!);

  // Retry with a fresh worker, then close the panel to cancel without changing notes.
  await convert.click();
  await expect.poll(() => modelRequests).toBe(2);
  await panel.getByRole("button", { name: "Close Audio to MIDI" }).click();
  await expect(panel).toBeHidden();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  await expect(notes).toHaveCount(1);
  await expect(notes.first()).toHaveAttribute("data-note-id", originalId!);

  // Release model loading and reopen the panel to complete a new conversion.
  modelGate.resolve();
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  await page
    .getByRole("menuitem", { name: "Audio to MIDI", exact: true })
    .click();
  const checkpoint = createCheckpoint();
  await convert.click();
  await expect(panel.getByRole("status")).toHaveText(
    /^Created [1-9]\d* notes in MIDI 1\.$/,
  );
  checkpoint("transcription retry completed");
  await expect(row.locator(`[data-note-id="${originalId}"]`)).toHaveCount(0);
  expect(await notes.count()).toBeGreaterThan(1);
});
