import { expect, test } from "@playwright/test";
import { installFakeMidiOutput } from "./helpers";

test("sends notes and controllers to a MIDI output", async ({ page }) => {
  await installFakeMidiOutput(page);

  // Open the page from the home page.
  await page.goto("/");
  await page.getByRole("link", { name: "MIDI Keyboard" }).click();
  await expect(page.getByLabel("MIDI output")).toContainText("Fake Output");

  const expectSent = (messages: number[][]) =>
    test.step(
      "Expect sent MIDI",
      async () => {
        await expect
          .poll(() => page.evaluate(() => window.__e2eSentMidi))
          .toEqual(messages);
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
  await expectSent([encodeNoteOn(60), encodeNoteOff(60)]);

  // Hold a black key from the computer keyboard, in the lower row.
  await page.keyboard.down("s");
  await expect(
    page.getByRole("button", { name: "C#3", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("s");
  await expectSent([encodeNoteOn(49), encodeNoteOff(49)]);

  // Shift up an octave, and hold a key across a shift back down.
  await page.keyboard.press("]");
  await page.keyboard.down("z");
  await page.keyboard.press("[");
  await page.keyboard.up("z");
  await expectSent([encodeNoteOn(60), encodeNoteOff(60)]);

  // Shift to the lowest octave with the buttons, which stop at the limit.
  const octaveDown = page.getByRole("button", { name: "Octave down" });
  await octaveDown.click();
  await octaveDown.click();
  await expect(octaveDown).toBeDisabled();
  await expect(
    page.getByRole("img", { name: "Keyboard shortcuts" }),
  ).toContainText("C1");
  await page.keyboard.press("z");
  await expectSent([encodeNoteOn(24), encodeNoteOff(24)]);

  // Nudge the mod wheel, which keeps its value.
  await page.getByRole("slider", { name: "Mod wheel" }).focus();
  await page.keyboard.press("ArrowRight");
  await expectSent([encodeController(1, 1)]);

  // Nudge the pitch bend, which springs back to center.
  await page.getByRole("slider", { name: "Pitch bend" }).focus();
  await page.keyboard.press("ArrowRight");
  await expectSent([encodePitchBend(8193), encodePitchBend(8192)]);
});

function encodeNoteOn(pitch: number): number[] {
  return [0x90, pitch, 100];
}

function encodeNoteOff(pitch: number): number[] {
  return [0x80, pitch, 0];
}

function encodeController(number: number, value: number): number[] {
  return [0xb0, number, value];
}

function encodePitchBend(value: number): number[] {
  return [0xe0, value & 0x7f, value >> 7];
}
