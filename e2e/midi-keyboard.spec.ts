import { expect, test } from "@playwright/test";
import { installFakeMidiOutput } from "./helpers";

test("sends notes and controllers to a MIDI output", async ({ page }) => {
  await installFakeMidiOutput(page);

  // Open the page from the home page.
  await page.goto("/");
  await page.getByRole("link", { name: "MIDI Keyboard" }).click();
  await expect(page.getByLabel("MIDI output")).toContainText("Fake Output");

  const expectSent = async (messages: number[][]) => {
    await expect
      .poll(() => page.evaluate(() => window.__e2eSentMidi))
      .toEqual(messages);
    await page.evaluate(() => (window.__e2eSentMidi = []));
  };

  // Press and release a piano key with the mouse.
  const c4 = page.getByRole("button", { name: "C4", exact: true });
  await c4.hover();
  await page.mouse.down();
  await expect(c4).toHaveAttribute("aria-pressed", "true");
  await page.mouse.up();
  await expect(c4).toHaveAttribute("aria-pressed", "false");
  await expectSent([
    [0x90, 60, 100],
    [0x80, 60, 0],
  ]);

  // Hold a black key from the computer keyboard, in the lower row.
  await page.keyboard.down("s");
  await expect(
    page.getByRole("button", { name: "C#3", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("s");
  await expectSent([
    [0x90, 49, 100],
    [0x80, 49, 0],
  ]);

  // Shift up an octave, and hold a key across a shift back down.
  await page.keyboard.press("]");
  await page.keyboard.down("z");
  await page.keyboard.press("[");
  await page.keyboard.up("z");
  await expectSent([
    [0x90, 60, 100],
    [0x80, 60, 0],
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
    [0x90, 24, 100],
    [0x80, 24, 0],
  ]);

  // Nudge the mod wheel, which keeps its value.
  await page.getByRole("slider", { name: "Mod wheel" }).focus();
  await page.keyboard.press("ArrowRight");
  await expectSent([[0xb0, 1, 1]]);

  // Nudge the pitch bend, which springs back to center.
  await page.getByRole("slider", { name: "Pitch bend" }).focus();
  await page.keyboard.press("ArrowRight");
  await expectSent([
    [0xe0, 1, 64],
    [0xe0, 0, 64],
  ]);
});
