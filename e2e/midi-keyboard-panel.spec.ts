import { expect, test } from "@playwright/test";
import {
  addMidiTrack,
  createProject,
  openMidiInstrument,
  selectMidiInstrument,
} from "./editor-helpers";

test("plays the monitored MIDI track from the MIDI keyboard panel", async ({
  page,
}) => {
  await createProject(page);

  // Add a synth track, which offers no monitoring without a live input.
  const row = await addMidiTrack(page);
  const instrument = await openMidiInstrument(page, { name: "MIDI 1" });
  await selectMidiInstrument(instrument, { option: "Subtractive Synth" });
  await instrument.getByRole("button", { name: "Close", exact: true }).click();
  const monitor = row.getByTestId("input-monitor");
  await expect(monitor).toHaveCount(0);

  // Open the panel from the editor menu, which offers monitoring.
  await page.getByRole("button", { name: "Editor menu" }).click();
  await page.getByRole("menuitem", { name: "MIDI Keyboard" }).click();
  const panel = page.getByTestId("midi-keyboard-panel");
  await expect(panel.getByRole("status")).toHaveText("No track");
  await monitor.click();
  await expect(panel.getByRole("status")).toHaveText("MIDI 1");

  await page.getByTestId("mixer-button").click();
  const meter = page
    .getByTestId("mixer-panel")
    // The instrument dialog hides the page from the accessibility tree.
    .getByRole("meter", { name: "MIDI 1 level", includeHidden: true });
  const getLevel = async () =>
    Number(await meter.getAttribute("aria-valuenow"));
  const expectSounding = () => expect.poll(getLevel).toBeGreaterThan(-60);
  const expectSilent = () => expect.poll(getLevel).toBe(-60);

  // Hold a piano key with the mouse, and hear it until release.
  await panel.getByRole("button", { name: "C4", exact: true }).hover();
  await page.mouse.down();
  await expectSounding();
  await page.mouse.up();
  await expectSilent();

  // Leave the computer keys as shortcuts until capture is on.
  await page.keyboard.down("a");
  await page.waitForTimeout(200);
  expect(await getLevel()).toBe(-60);
  await page.keyboard.up("a");

  // Turn on capture, which marks the keys on the piano, and play a note.
  const panelSize = await panel.boundingBox();
  await panel.getByRole("button", { name: "Computer keys" }).click();
  const c3 = panel.getByRole("button", { name: "C3", exact: true });
  await expect(c3).toContainText("A");
  expect(await panel.boundingBox()).toEqual(panelSize);
  await page.keyboard.down("a");
  await expect(c3).toHaveAttribute("aria-pressed", "true");
  await expectSounding();
  await page.keyboard.up("a");
  await expectSilent();

  // Play a note from L, which adds no locator while capture is on.
  await page.keyboard.down("l");
  const d4 = panel.getByRole("button", { name: "D4", exact: true });
  await expect(d4).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("l");
  await expect(d4).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("locator")).toHaveCount(0);

  // Shift an octave, and release the note it started after shifting back.
  await page.keyboard.press("x");
  await page.keyboard.down("a");
  const c4 = panel.getByRole("button", { name: "C4", exact: true });
  await expect(c4).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("z");
  await page.keyboard.up("a");
  await expect(c4).toHaveAttribute("aria-pressed", "false");
  await expectSilent();

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

  // Read how to use the keys from the help popover.
  await panel.getByRole("button", { name: "MIDI Keyboard help" }).click();
  await expect(page.getByText("Octave down, up")).toBeVisible();
  await page.keyboard.press("Escape");

  // Play from inside the instrument dialog while browsing presets.
  const dialog = await openMidiInstrument(page, { name: "MIDI 1" });
  await page.keyboard.down("a");
  await expectSounding();
  await page.keyboard.up("a");
  await expectSilent();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

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
