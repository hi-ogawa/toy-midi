import { expect, test } from "@playwright/test";
import { addMidiTrack, createProject } from "./editor-helpers";

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

  // Hold a piano key with the mouse until release.
  const c4 = panel.getByRole("button", { name: "C4", exact: true });
  await c4.hover();
  await page.mouse.down();
  await expect(c4).toHaveAttribute("aria-pressed", "true");
  await page.mouse.up();
  await expect(c4).toHaveAttribute("aria-pressed", "false");

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
  await page.keyboard.up("a");
  await expect(c3).toHaveAttribute("aria-pressed", "false");

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

test("bends and modulates from the MIDI keyboard panel", async ({ page }) => {
  await createProject(page);

  // Monitor a track from the panel.
  const first = await addMidiTrack(page);
  const second = await addMidiTrack(page);
  await page.getByRole("button", { name: "Editor menu" }).click();
  await page.getByRole("menuitem", { name: "MIDI Keyboard" }).click();
  const panel = page.getByTestId("midi-keyboard-panel");
  await first.getByTestId("input-monitor").click();

  // Hold the bend off center, and let go so it springs back.
  const bend = panel.getByRole("slider", { name: "Pitch bend" });
  await bend.hover();
  await page.mouse.down();
  const { x, y } = (await bend.boundingBox())!;
  await page.mouse.move(x + 20, y);
  await expect(bend).not.toHaveAttribute("aria-valuenow", "8192");
  await page.mouse.up();
  await expect(bend).toHaveAttribute("aria-valuenow", "8192");

  // Turn up the mod wheel, which stays where it is left.
  const mod = panel.getByRole("slider", { name: "Mod wheel" });
  await mod.press("End");
  await expect(mod).toHaveAttribute("aria-valuenow", "127");

  // Move monitoring to another track, which starts with no modulation.
  await second.getByTestId("input-monitor").click();
  await expect(mod).toHaveAttribute("aria-valuenow", "0");
});
