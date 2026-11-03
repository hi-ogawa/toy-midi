import { expect, test } from "@playwright/test";
import {
  addMidiTrack,
  createProject,
  openMidiInstrument,
  selectMidiInstrument,
} from "./editor-helpers";
import { expectSilence, expectSound, tapMasterOutput } from "./helpers";

test("plays notes from the MIDI keyboard panel", async ({ page }) => {
  await createProject(page);

  // Add a track, which offers no monitoring without a live input.
  const row = await addMidiTrack(page);
  const monitor = row.getByTestId("input-monitor");
  await expect(monitor).toHaveCount(0);

  // Open the panel from the editor menu, which offers monitoring.
  await page.getByRole("button", { name: "Editor menu" }).click();
  await page.getByRole("menuitem", { name: "MIDI Keyboard" }).click();
  const panel = page.getByTestId("midi-keyboard-panel");
  await expect(panel.getByRole("status")).toHaveText("No track");
  await monitor.click();
  await expect(panel.getByRole("status")).toHaveText("MIDI 1");
  await tapMasterOutput(page);

  // Hold a piano key with the mouse, which sounds until release.
  const c4 = panel.getByRole("button", { name: "C4", exact: true });
  await c4.hover();
  await page.mouse.down();
  await expect(c4).toHaveAttribute("aria-pressed", "true");
  await expectSound(page);
  await page.mouse.up();
  await expect(c4).toHaveAttribute("aria-pressed", "false");
  await expectSilence(page);

  // Leave the computer keys as shortcuts until capture is on.
  const c3 = panel.getByRole("button", { name: "C3", exact: true });
  await page.keyboard.down("a");
  await expect(c3).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.up("a");

  // Turn on capture, which marks the keys on the piano, and play a note.
  await panel.getByRole("button", { name: "Computer keys" }).click();
  await expect(c3).toContainText("A");
  await page.keyboard.down("a");
  await expect(c3).toHaveAttribute("aria-pressed", "true");
  await expectSound(page);
  await page.keyboard.up("a");
  await expect(c3).toHaveAttribute("aria-pressed", "false");
  await expectSilence(page);

  // Switch the instrument, and play it from the keys inside its dialog.
  const instrument = await openMidiInstrument(page, { name: "MIDI 1" });
  await selectMidiInstrument(instrument, { option: "Subtractive Synth" });
  await page.keyboard.down("a");
  await expectSound(page);
  await page.keyboard.up("a");
  await expectSilence(page);
  await instrument.getByRole("button", { name: "Close", exact: true }).click();

  // Play a note from L, which adds no locator while capture is on.
  await page.keyboard.down("l");
  const d4 = panel.getByRole("button", { name: "D4", exact: true });
  await expect(d4).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("l");
  await expect(d4).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("locator")).toHaveCount(0);

  // Step up an octave from the panel, which moves the piano and the key marks.
  await panel.getByRole("button", { name: "Octave up" }).click();
  await expect(
    panel.getByRole("button", { name: "C5", exact: true }),
  ).toContainText("K");
  await expect(c3).toHaveCount(0);
  await panel.getByRole("button", { name: "Octave down" }).click();

  // Widen the panel, which adds unmarked notes around the same range.
  const a2 = panel.getByRole("button", { name: "A2", exact: true });
  await expect(a2).toHaveCount(0);
  const handle = panel.getByRole("button", { name: "Resize MIDI Keyboard" });
  await handle.hover();
  await page.mouse.down();
  const { x, y } = (await handle.boundingBox())!;
  await page.mouse.move(x - 120, y);
  await page.mouse.up();
  await expect(a2).toHaveText("");
  await expect(c3).toContainText("A");

  // Close the panel, which ends monitoring.
  await panel.getByRole("button", { name: "Close MIDI Keyboard" }).click();
  await expect(panel).toHaveCount(0);
  await expect(monitor).toHaveCount(0);

  // Open it again, at its saved width with capture back off.
  await page.getByRole("button", { name: "Editor menu" }).click();
  await page.getByRole("menuitem", { name: "MIDI Keyboard" }).click();
  await expect(
    panel.getByRole("button", { name: "Computer keys" }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(a2).toBeVisible();
});
