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
    // Output level of a quiet note relative to a loud one: the closer to
    // 0 dB, the less the drive lets a decaying note fade.
    const fade = (preset: AmpParameters["preset"]) => {
      const level = (amplitude: number) =>
        measureRms(
          runAmp(
            { preset, cabinet: false },
            createSine({ frequency: 220, amplitude }),
          ).slice(2400),
        );
      return gainToDb(level(0.02) / level(0.5));
    };
    expect(fade("crunch")).toBeLessThan(-6);
    expect(fade("high-gain")).toBeGreaterThan(-3);
  });

  it("adds even harmonics through the shifted first stage", () => {
    const output = runAmp(
      { preset: "crunch", cabinet: false },
      createSine({ frequency: 200, amplitude: 0.05 }),
    ).slice(2400);
    const harmonic = (n: number) => measureHarmonic(output, 200 * n);
    expect(gainToDb(harmonic(2) / harmonic(1))).toBeGreaterThan(-50);
  });

  it("rolls off the clipping's fizz with the cabinet", () => {
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
    amp.process({ input: [left, right], output });
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
  amp.process({ input: [input], output: [output] });
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
