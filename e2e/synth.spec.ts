import { expect, test } from "@playwright/test";
import {
  addMidiTrack,
  createProject,
  openMidiInstrument,
  selectMidiInstrument,
} from "./editor-helpers";
import { getMenuItem, selectMenuItem } from "./helpers";

test("changes a synth track's waveform in its Synth panel", async ({
  page,
}) => {
  // Add two MIDI tracks, and switch the first to the synth.
  await createProject(page);
  await addMidiTrack(page);
  await addMidiTrack(page);
  const instrument = await openMidiInstrument(page, { name: "MIDI 1" });
  await selectMidiInstrument(instrument, { option: "Subtractive Synth" });
  await instrument.getByRole("button", { name: "Close", exact: true }).click();

  // See that only the synth track offers a Synth panel.
  await expect(
    await getMenuItem(page, { menu: "MIDI 2 actions", item: "Effects…" }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Synth…" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Open the synth track's panel, and see the patch's default sine selected.
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Synth…" });
  const panel = page.getByTestId("synth-panel");
  await expect(
    panel.getByRole("heading", { name: "MIDI 1 Synth" }),
  ).toBeVisible();
  const waveform = panel.getByRole("group", { name: "Waveform" });
  await expect(waveform.getByRole("button", { name: "Sine" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Switch to sawtooth, and see the panel follow the track's patch.
  await waveform.getByRole("button", { name: "Saw" }).click();
  await expect(waveform.getByRole("button", { name: "Saw" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(waveform.getByRole("button", { name: "Sine" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
