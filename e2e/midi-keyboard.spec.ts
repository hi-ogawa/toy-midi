import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    sentMidi: number[][];
  }
}

// Playwright has no virtual MIDI device, so this replaces the browser's access.
async function installFakeMidiOutput(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.sentMidi = [];
    const output = {
      id: "fake-output",
      name: "Fake Output",
      state: "connected",
      send: (bytes: number[]) => window.sentMidi.push(bytes),
    };
    navigator.requestMIDIAccess = async () =>
      ({
        outputs: new Map([[output.id, output]]),
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MIDIAccess;
  });
}

test("opens a demo track in a new tab", async ({ page, context }) => {
  await installFakeMidiOutput(page);
  await page.goto("/midi-keyboard");

  // Open the help.
  await page.getByRole("button", { name: "MIDI keyboard help" }).click();

  // Follow the demo link, and find one MIDI track to monitor.
  const [editor] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: "demo track" }).click(),
  ]);
  await expect(editor.getByTestId("midi-track-row")).toHaveCount(1);
});

test("sends notes and controllers to a MIDI output", async ({ page }) => {
  await installFakeMidiOutput(page);

  // Open the page from the home page.
  await page.goto("/");
  await page.getByRole("link", { name: "MIDI Keyboard" }).click();
  await expect(page.getByLabel("MIDI output")).toContainText("Fake Output");

  const expectSent = async (messages: number[][]) => {
    await expect
      .poll(() => page.evaluate(() => window.sentMidi))
      .toEqual(messages);
    await page.evaluate(() => (window.sentMidi = []));
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
    page.getByRole("img", { name: "Computer keyboard mapping" }),
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
