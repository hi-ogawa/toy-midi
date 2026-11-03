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
  await expect(panel.getByRole("status")).toContainText("Turn on");
  await monitor.click();
  await expect(panel.getByRole("status")).toContainText("Playing MIDI 1");

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

  // Turn on capture, and play a note from the computer keyboard.
  await page.keyboard.press("Shift+C");
  await expect(
    panel.getByRole("img", { name: "Keyboard shortcuts" }),
  ).toBeVisible();
  await page.keyboard.down("a");
  await expect(
    panel.getByRole("button", { name: "C3", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
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

  // Play from inside the instrument dialog while browsing presets.
  const dialog = await openMidiInstrument(page, { name: "MIDI 1" });
  await page.keyboard.down("a");
  await expectSounding();
  await page.keyboard.up("a");
  await expectSilent();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  // Hide the panel by shortcut, which ends monitoring.
  await page.keyboard.press("Shift+K");
  await expect(panel).toHaveCount(0);
  await expect(monitor).toHaveCount(0);

  // Show it again, with capture back off.
  await page.keyboard.press("Shift+K");
  await expect(
    panel.getByRole("button", { name: "Computer keys" }),
  ).toHaveAttribute("aria-pressed", "false");
});
