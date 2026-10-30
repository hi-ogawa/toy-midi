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

  // Turn the layer's gain down from 0 dB with the keyboard.
  const gain = panel.getByRole("slider", { name: "Layer 1 gain" });
  await expect(gain).toHaveAttribute("aria-valuetext", "0.0 dB");
  await gain.focus();
  await page.keyboard.press("Shift+ArrowDown");
  await expect(gain).toHaveAttribute("aria-valuetext", "-6.0 dB");
});

test("adds, collapses, and removes layers in the Synth panel", async ({
  page,
}) => {
  // Open a synth track's panel, and see its one layer with removal disabled.
  await createProject(page);
  await addMidiTrack(page);
  const instrument = await openMidiInstrument(page, { name: "MIDI 1" });
  await selectMidiInstrument(instrument, { option: "Subtractive Synth" });
  await instrument.getByRole("button", { name: "Close", exact: true }).click();
  await selectMenuItem(page, { menu: "MIDI 1 actions", item: "Synth…" });
  const panel = page.getByTestId("synth-panel");
  const layer1 = panel.getByRole("group", { name: "Layer 1" });
  const layer2 = panel.getByRole("group", { name: "Layer 2" });
  await expect(
    layer1.getByRole("button", { name: "Remove Layer 1" }),
  ).toBeDisabled();

  // Add a layer, and see it start from the default sine.
  await panel.getByRole("button", { name: "+ Layer" }).click();
  await expect(layer2.getByRole("button", { name: "Sine" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    layer1.getByRole("button", { name: "Remove Layer 1" }),
  ).toBeEnabled();

  // Switch the second layer to square, and see the first layer keep sine.
  await layer2.getByRole("button", { name: "Square" }).click();
  await expect(layer2.getByRole("button", { name: "Square" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(layer1.getByRole("button", { name: "Sine" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Collapse the first layer to its header, and see the second stay open.
  await layer1.getByRole("button", { name: "Layer 1", exact: true }).click();
  await expect(layer1.getByRole("group", { name: "Waveform" })).toHaveCount(0);
  await expect(layer2.getByRole("group", { name: "Waveform" })).toBeVisible();

  // Remove the first layer, and see the square layer move up, open, as the
  // only layer.
  await layer1.getByRole("button", { name: "Remove Layer 1" }).click();
  await expect(layer2).toHaveCount(0);
  await expect(layer1.getByRole("button", { name: "Square" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    layer1.getByRole("button", { name: "Remove Layer 1" }),
  ).toBeDisabled();
});
