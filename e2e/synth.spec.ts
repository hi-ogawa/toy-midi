import { expect, test } from "@playwright/test";
import {
  addMidiTrack,
  createProject,
  openMidiInstrument,
  selectMidiInstrument,
} from "./editor-helpers";
import { getMenuItem, selectMenuItem, setSliderValue } from "./helpers";

test("changes a synth track's waveform and amp envelope in its Synth panel", async ({
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

  // See the amp envelope start as a 5 ms gate.
  const attack = panel.getByRole("slider", { name: "Attack" });
  await expect(attack).toHaveAttribute("aria-valuetext", "5 ms");
  const sustain = panel.getByRole("slider", { name: "Sustain" });
  await expect(sustain).toHaveAttribute("aria-valuetext", "1.00");

  // Lengthen the release to 1 s, three of the slider's four decades up from
  // 1 ms, and lower the sustain to half.
  const release = panel.getByRole("slider", { name: "Release" });
  await setSliderValue(release, [0.75]);
  await expect(release).toHaveAttribute("aria-valuetext", "1 s");
  await setSliderValue(sustain, [0.5]);
  await expect(sustain).toHaveAttribute("aria-valuetext", "0.50");
  await expect(attack).toHaveAttribute("aria-valuetext", "5 ms");
});
