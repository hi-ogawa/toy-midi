import { describe, expect, it } from "vitest";
import { gainToDb } from "../music";
import { Amp, type AmpParameters } from "./amp";

const SAMPLE_RATE = 48000;

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
    const amp = new Amp({
      sampleRate: SAMPLE_RATE,
      parameters: { preset: "crunch", cabinet: true },
    });
    const left = createSine({ frequency: 220, amplitude: 0.3 });
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
  const amp = new Amp({ sampleRate: SAMPLE_RATE, parameters });
  const output = new Float32Array(input.length);
  amp.process({ input: [input], output: [output] });
  return output;
}

function createSine({
  frequency,
  amplitude,
  phase = 0,
  length = 9600,
}: {
  frequency: number;
  amplitude: number;
  phase?: number;
  length?: number;
}): Float32Array {
  return Float32Array.from(
    { length },
    (_, i) =>
      amplitude * Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE + phase),
  );
}

function measureRms(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] ** 2;
  }
  return Math.sqrt(sum / samples.length);
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
