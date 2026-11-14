import { expect, test } from "@playwright/test";
import type { MidiMessage } from "../src/lib/general-midi";
import { encodeMidiMessage } from "../src/lib/midi-device";
import { installFakeMidiOutput } from "./helpers";

test("sends notes and controllers to a MIDI output", async ({ page }) => {
  await installFakeMidiOutput(page);

  // Open the page from the home page.
  await page.goto("/");
  await page.getByRole("link", { name: "MIDI Keyboard" }).click();
  await expect(page.getByLabel("MIDI output")).toContainText("Fake Output");

  const expectSent = (messages: MidiMessage[]) =>
    test.step(
      "Expect sent MIDI",
      async () => {
        await expect
          .poll(() => page.evaluate(() => window.__e2eSentMidi))
          .toEqual(messages.map(encodeMidiMessage));
        await page.evaluate(() => (window.__e2eSentMidi = []));
      },
      { box: true },
    );

  // Press and release a piano key with the mouse.
  const c4 = page.getByRole("button", { name: "C4", exact: true });
  await c4.hover();
  await page.mouse.down();
  await expect(c4).toHaveAttribute("aria-pressed", "true");
  await page.mouse.up();
  await expect(c4).toHaveAttribute("aria-pressed", "false");
  await expectSent([
    { type: "note-on", pitch: 60, velocity: 100 },
    { type: "note-off", pitch: 60 },
  ]);

  // Hold a black key from the computer keyboard, in the lower row.
  await page.keyboard.down("s");
  await expect(
    page.getByRole("button", { name: "C#3", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("s");
  await expectSent([
    { type: "note-on", pitch: 49, velocity: 100 },
    { type: "note-off", pitch: 49 },
  ]);

  // Shift up an octave, and hold a key across a shift back down.
  await page.keyboard.press("]");
  await page.keyboard.down("z");
  await page.keyboard.press("[");
  await page.keyboard.up("z");
  await expectSent([
    { type: "note-on", pitch: 60, velocity: 100 },
    { type: "note-off", pitch: 60 },
  ]);

  // Shift to the lowest octave with the buttons, which stop at the limit.
  const octaveDown = page.getByRole("button", { name: "Octave down" });
  await octaveDown.click();
  await octaveDown.click();
  await expect(octaveDown).toBeDisabled();
  await expect(
    page.getByRole("img", { name: "Keyboard shortcuts" }),
  ).toContainText("C1");
  await page.keyboard.press("z");
  await expectSent([
    { type: "note-on", pitch: 24, velocity: 100 },
    { type: "note-off", pitch: 24 },
  ]);

  // Nudge the mod wheel, which keeps its value.
  await page.getByRole("slider", { name: "Mod wheel" }).focus();
  await page.keyboard.press("ArrowRight");
  await expectSent([{ type: "controller", controller: 1, value: 1 }]);

  // Nudge the pitch bend, which springs back to center.
  await page.getByRole("slider", { name: "Pitch bend" }).focus();
  await page.keyboard.press("ArrowRight");
  await expectSent([
    { type: "pitch-bend", value: 8193 },
    { type: "pitch-bend", value: 8192 },
  ]);
});
