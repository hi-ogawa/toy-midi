import { describe, expect, it } from "vitest";
import { dbToGain } from "../music";
import type { EqParameters } from "./biquad-eq";
import { MAX_EQ_BANDS, MultibandEq } from "./biquad-eq-multiband";

const SAMPLE_RATE = 48000;
const DEFAULT_PARAMETERS: EqParameters = {
  frequency: 1000,
  gain: 1,
  q: 1,
  bypass: false,
};

describe(MultibandEq, () => {
  it("cascades bands in one fixed-capacity processor", () => {
    const eq = new MultibandEq({
      sampleRate: SAMPLE_RATE,
      channelCount: 1,
      parameters: {
        bypass: false,
        bands: ["a", "b"].map((id) => ({
          id,
          ...DEFAULT_PARAMETERS,
          gain: dbToGain(6),
        })),
      },
    });
    const input = createSignal({ frames: SAMPLE_RATE, frequency: 1000 });
    const output = process(eq, input);
    expect(
      10 *
        Math.log10(
          measureEnergy(output.subarray(SAMPLE_RATE / 2)) /
            measureEnergy(input.subarray(SAMPLE_RATE / 2)),
        ),
    ).toBeCloseTo(12, 3);
  });

  it("reconciles updates by band ID without resetting its ramp", () => {
    const eq = new MultibandEq({
      sampleRate: SAMPLE_RATE,
      channelCount: 1,
      parameters: {
        bypass: false,
        bands: [{ id: "band", ...DEFAULT_PARAMETERS }],
      },
    });
    eq.setParameters({
      bypass: false,
      bands: [{ id: "band", ...DEFAULT_PARAMETERS, gain: dbToGain(18) }],
    });
    const input = createSignal({ frames: 100, frequency: 1000 });
    const ramped = process(eq, input);
    const replaced = process(
      new MultibandEq({
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
        parameters: {
          bypass: false,
          bands: [
            { id: "replacement", ...DEFAULT_PARAMETERS, gain: dbToGain(18) },
          ],
        },
      }),
      input,
    );
    expect(measureEnergy(ramped) / measureEnergy(replaced)).toBeLessThan(0.5);
  });

  it("rejects state beyond its fixed capacity", () => {
    expect(
      () =>
        new MultibandEq({
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          parameters: {
            bypass: false,
            bands: Array.from({ length: MAX_EQ_BANDS + 1 }, (_, index) => ({
              id: String(index),
              ...DEFAULT_PARAMETERS,
            })),
          },
        }),
    ).toThrow(`EQ supports at most ${MAX_EQ_BANDS} bands`);
  });
});

function createSignal({
  frames,
  frequency,
}: {
  frames: number;
  frequency: number;
}): Float32Array {
  return Float32Array.from({ length: frames }, (_, i) =>
    Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE),
  );
}

function process(eq: MultibandEq, input: Float32Array): Float32Array {
  const output = new Float32Array(input.length);
  eq.process({ input: [input], output: [output] });
  return output;
}

function measureEnergy(signal: Float32Array): number {
  let energy = 0;
  for (const sample of signal) {
    energy += sample ** 2;
  }
  return energy;
}
