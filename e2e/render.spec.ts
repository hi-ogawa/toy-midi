import { expect, test } from "@playwright/test";
import type { AmpParameters } from "../src/lib/dsp/amp";
import type { SynthPatch } from "../src/lib/dsp/sine-synth";
import type { SharedProject } from "../src/lib/project-share";
import {
  measureRmsDb,
  type RenderedMix,
  renderProject,
} from "./render-helpers";

test("renders MIDI automation", async ({ page }) => {
  // Render a held note that swells in from silence on expression (CC11),
  // reaching full level at beat 2, one second at 120 BPM.
  const mix = await renderProject(page, {
    title: "Swell",
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    midiTracks: [
      {
        name: "Strings",
        program: 48,
        notes: [{ pitch: 60, start: 0, duration: 4, velocity: 100 }],
        automation: [
          {
            type: "controller",
            controller: 11,
            points: [
              { beat: 0, value: 0 },
              { beat: 2, value: 127 },
            ],
          },
        ],
      },
    ],
  });

  // Check the note is silent before the swell, below what a 16-bit WAV can
  // hold, and sounds after it.
  expect(measureRmsDb(mix, { start: 0, end: 0.9 })).toBeLessThan(-96);
  expect(measureRmsDb(mix, { start: 1, end: 2 })).toBeGreaterThan(-60);
});

test("renders a track's own synth", async ({ page }) => {
  // Render a held piano note, once on the SoundFont and once on the sine
  // synth, ending at beat 4, two seconds at 120 BPM.
  const createProject = (synth?: SynthPatch): SharedProject => ({
    title: "Synth",
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    midiTracks: [
      {
        name: "Synth",
        program: 0,
        notes: [{ pitch: 69, start: 0, duration: 4, velocity: 100 }],
        synth,
      },
    ],
  });
  const piano = await renderProject(page, createProject());
  const sine = await renderProject(page, createProject({}));

  // Check the piano decays while the sine holds its level, and the sine stops
  // at the note's end, below what a 16-bit WAV can hold.
  const measureDecay = (mix: RenderedMix) =>
    measureRmsDb(mix, { start: 0.1, end: 0.5 }) -
    measureRmsDb(mix, { start: 1.5, end: 1.9 });
  expect(measureDecay(piano)).toBeGreaterThan(6);
  expect(Math.abs(measureDecay(sine))).toBeLessThan(0.1);
  expect(measureRmsDb(sine, { start: 2.1, end: 3 })).toBeLessThan(-96);
});

test("renders a track's amp", async ({ page }) => {
  // Render one guitar note with and without the amp.
  const createProject = (amp?: AmpParameters): SharedProject => ({
    title: "Amp",
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    midiTracks: [
      {
        name: "Guitar",
        program: 27,
        notes: [{ pitch: 52, start: 0, duration: 2, velocity: 100 }],
        amp,
      },
    ],
  });
  const dry = await renderProject(page, createProject());
  const amped = await renderProject(
    page,
    createProject({ preset: "high-gain", cabinet: true }),
  );

  // Check the amp's drive makes the note louder, which it can't unless the
  // track's mix runs through it.
  const range = { start: 0, end: 1 };
  expect(measureRmsDb(amped, range)).toBeGreaterThan(
    measureRmsDb(dry, range) + 6,
  );
});
