import { describe, expect, it } from "vitest";
import { gainToDb } from "../music";
import { Amp, type AmpParameters } from "./amp";
import { createSine, measureRms, SAMPLE_RATE } from "./helper";

describe(Amp, () => {
  it.each(["crunch", "high-gain"] as const)(
    "keeps silence silent through %s",
    (preset) => {
      const output = runAmp({ preset, cabinet: true }, new Float32Array(4800));
      expect(output.every((y) => y === 0)).toBe(true);
    },
  );

  it("sustains a decaying note more on high gain than on crunch", () => {
    // A note at its attack and late in its decay. The drive has no time
    // behavior of its own, so these two steady levels stand in for the note's
    // envelope. Levels are RMS in dBFS, rounded.
    const attack = createSine({ frequency: 220, amplitude: 0.5 });
    const decay = createSine({ frequency: 220, amplitude: 0.02 });
    const measureDb = (samples: Float32Array) =>
      Math.round(gainToDb(measureRms(samples.slice(2400))));
    const runDrive = (preset: AmpParameters["preset"], input: Float32Array) =>
      measureDb(runAmp({ preset, cabinet: false }, input));
    const levels = {
      input: [measureDb(attack), measureDb(decay)],
      crunch: [runDrive("crunch", attack), runDrive("crunch", decay)],
      "high-gain": [
        runDrive("high-gain", attack),
        runDrive("high-gain", decay),
      ],
    };
    expect(
      Object.entries(levels)
        .map(([name, [from, to]]) => `${name}: ${from} → ${to}`)
        .join("\n"),
    ).toMatchInlineSnapshot(`
      "input: -9 → -37
      crunch: -19 → -31
      high-gain: -18 → -20"
    `);
    // The input fades 28 dB. Crunch passes much of that fade through, and high
    // gain barely fades.
    expect(levels.crunch[0] - levels.crunch[1]).toBeGreaterThan(6);
    expect(levels["high-gain"][0] - levels["high-gain"][1]).toBeLessThan(3);
  });

  // TODO: Contrast with the same chain without the shift, whose 2nd harmonic
  // should vanish. That needs AmpChain to take stages instead of a preset, so
  // a test can build crunch with shift 0.
  it("adds even harmonics through the shifted first stage", () => {
    const output = runAmp(
      { preset: "crunch", cabinet: false },
      createSine({ frequency: 200, amplitude: 0.05 }),
    ).slice(2400);
    const harmonic = (n: number) => measureHarmonic(output, 200 * n);
    expect(gainToDb(harmonic(2) / harmonic(1))).toBeGreaterThan(-50);
  });

  it("rolls off the clipping's fizz with the cabinet", () => {
    // The 23rd harmonic, at 10.1 kHz, is a strong odd harmonic of the
    // clipping in the fizz band the cabinet removes.
    const fizz = (cabinet: boolean) => {
      const output = runAmp(
        { preset: "high-gain", cabinet },
        createSine({ frequency: 440, amplitude: 0.3 }),
      ).slice(2400);
      return measureHarmonic(output, 440 * 23) / measureHarmonic(output, 440);
    };
    expect(gainToDb(fizz(true) / fizz(false))).toBeLessThan(-20);
  });

  it("writes the same mono signal to every output channel", () => {
    const left = createSine({ frequency: 220, amplitude: 0.3 });
    const amp = new Amp({
      sampleRate: SAMPLE_RATE,
      blockFrames: left.length,
      parameters: { preset: "crunch", cabinet: true },
    });
    const right = new Float32Array(left.length);
    const output = [
      new Float32Array(left.length),
      new Float32Array(left.length),
    ];
    amp.process([left, right], output);
    expect(output[1]).toEqual(output[0]);
    expect(measureRms(output[0])).toBeGreaterThan(0);
  });
});

function runAmp(parameters: AmpParameters, input: Float32Array): Float32Array {
  const amp = new Amp({
    sampleRate: SAMPLE_RATE,
    blockFrames: input.length,
    parameters,
  });
  const output = new Float32Array(input.length);
  amp.process([input], [output]);
  return output;
}

/** Amplitude of one frequency, by correlating with a sine and a cosine. */
function measureHarmonic(
  samples: ArrayLike<number>,
  frequency: number,
): number {
  let re = 0;
  let im = 0;
  for (let i = 0; i < samples.length; i++) {
    const angle = (2 * Math.PI * frequency * i) / SAMPLE_RATE;
    re += samples[i] * Math.cos(angle);
    im += samples[i] * Math.sin(angle);
  }
  return (2 * Math.hypot(re, im)) / samples.length;
}
