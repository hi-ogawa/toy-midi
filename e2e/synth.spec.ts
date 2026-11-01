import { expect, test } from "@playwright/test";
import {
  addMidiTrack,
  createProject,
  dragBy,
  openMidiInstrument,
  selectMidiInstrument,
} from "./editor-helpers";
import { getMenuItem, selectMenuItem } from "./helpers";

test("changes a synth track's oscillator and amp envelope in its Synth panel", async ({
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

  // Click the octave stepper down to a sub octave, then step it up past the
  // note's octave with the keyboard.
  const octave = panel.getByRole("spinbutton", { name: "Octave" });
  await expect(octave).toHaveAttribute("aria-valuetext", "0");
  await octave.locator("button").first().click();
  await expect(octave).toHaveAttribute("aria-valuetext", "-1");
  await octave.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(octave).toHaveAttribute("aria-valuetext", "+1");

  // Detune the layer by cents with the keyboard, in fine and coarse steps.
  const detune = panel.getByRole("slider", { name: "Detune" });
  await expect(detune).toHaveAttribute("aria-valuetext", "0 cents");
  await detune.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(detune).toHaveAttribute("aria-valuetext", "+2 cents");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(detune).toHaveAttribute("aria-valuetext", "-8 cents");

  // See the amp envelope start as a 5 ms gate.
  const attack = panel.getByRole("slider", { name: "Attack" });
  await expect(attack).toHaveAttribute("aria-valuetext", "5 ms");
  const sustain = panel.getByRole("slider", { name: "Sustain" });
  await expect(sustain).toHaveAttribute("aria-valuetext", "0.0 dB");

  // Lengthen the release by two decades with the keyboard.
  const release = panel.getByRole("slider", { name: "Release" });
  await release.focus();
  await page.keyboard.press("Shift+ArrowUp");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(release).toHaveAttribute("aria-valuetext", "500 ms");

  // Drag the decay handle halfway down the graph, which lowers the sustain to
  // half of the graph's 60 dB range and leaves the attack alone.
  const decay = panel.getByTestId("envelope-decay-handle");
  const decayBox = (await decay.boundingBox())!;
  const releaseBox = (await panel
    .getByTestId("envelope-release-handle")
    .boundingBox())!;
  await dragBy(page, decay, 0, { deltaY: (releaseBox.y - decayBox.y) / 2 });
  await expect(sustain).toHaveAttribute("aria-valuetext", "-30.0 dB");
  await expect(attack).toHaveAttribute("aria-valuetext", "5 ms");

  // Turn the layer's gain down from 0 dB with the keyboard.
  const gain = panel.getByRole("slider", { name: "Layer 1 gain" });
  await expect(gain).toHaveAttribute("aria-valuetext", "0.0 dB");
  await gain.focus();
  await page.keyboard.press("Shift+ArrowDown");
  await expect(gain).toHaveAttribute("aria-valuetext", "-6.0 dB");

  // Pan the layer from the center to the left with the keyboard.
  const pan = panel.getByRole("slider", { name: "Layer 1 pan" });
  await expect(pan).toHaveAttribute("aria-valuetext", "C");
  await pan.focus();
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(pan).toHaveAttribute("aria-valuetext", "L10");
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
