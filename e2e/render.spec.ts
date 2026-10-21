import { expect, test } from "@playwright/test";
import { measureRmsDb, renderProject } from "./render-helpers";

test("renders MIDI automation", async ({ page }) => {
  // RenderedMix a held note that swells in from silence on expression (CC11),
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
