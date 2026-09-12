import { describe, expect, it } from "vitest";
import { dbToGain, gainToDb } from "../music";
import {
  calculateBiquadEqCoefficients,
  calculateBiquadEqResponse,
  type EqParameters,
  BiquadEq,
} from "./biquad-eq";
import { MAX_EQ_BANDS, MultibandEq } from "./multiband-eq";

const SAMPLE_RATE = 48000;
const DEFAULT_PARAMETERS: EqParameters = {
  frequency: 1000,
  gain: 1,
  q: 1,
  bypass: false,
};

describe(BiquadEq, () => {
  it.each([-18, -6, 6, 18])(
    "applies %s dB at the center frequency",
    (gainDb) => {
      expect(
        measureResponse({
          gain: dbToGain(gainDb),
          signalFrequency: 1000,
          eqFrequency: 1000,
          q: 1,
        }),
      ).toBeCloseTo(gainDb, 3);
    },
  );

  it("narrows the bandwidth as Q increases and preserves distant frequencies", () => {
    expect(
      measureResponse({
        gain: dbToGain(12),
        signalFrequency: 1000,
        eqFrequency: 1500,
        q: 1,
      }),
    ).toBeGreaterThan(
      measureResponse({
        gain: dbToGain(12),
        signalFrequency: 1000,
        eqFrequency: 1500,
        q: 8,
      }),
    );
    expect(
      measureResponse({
        gain: dbToGain(12),
        signalFrequency: 20,
        eqFrequency: 1500,
        q: 1,
      }),
    ).toBeCloseTo(0, 1);
    expect(
      measureResponse({
        gain: dbToGain(12),
        signalFrequency: 20000,
        eqFrequency: 1500,
        q: 1,
      }),
    ).toBeCloseTo(0, 1);
  });

  it("ramps gain rather than switching immediately", () => {
    const eq = new BiquadEq({
      sampleRate: SAMPLE_RATE,
      channelCount: 1,
      ...DEFAULT_PARAMETERS,
    });
    eq.setParameters({ gain: dbToGain(18) });
    const input = createSignal({ frames: 2000, frequency: 1000 });
    const ramped = process(eq, input);
    const immediate = process(
      new BiquadEq({
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
        ...DEFAULT_PARAMETERS,
        gain: dbToGain(18),
      }),
      input,
    );
    expect(
      measureEnergy(ramped.subarray(0, 100)) /
        measureEnergy(immediate.subarray(0, 100)),
    ).toBeLessThan(0.5);
    expect(
      measureEnergy(ramped.subarray(1000)) /
        measureEnergy(immediate.subarray(1000)),
    ).toBeCloseTo(1, 3);
  });

  it("resets history and settles pending parameters", () => {
    const eq = new BiquadEq({
      sampleRate: SAMPLE_RATE,
      channelCount: 1,
      ...DEFAULT_PARAMETERS,
      gain: dbToGain(18),
    });
    process(eq, createSignal({ frames: 100, frequency: 1000 }));
    eq.setParameters({ frequency: 3000, gain: dbToGain(-6), q: 3 });
    eq.reset();
    const fresh = new BiquadEq({
      sampleRate: SAMPLE_RATE,
      channelCount: 1,
      frequency: 3000,
      gain: dbToGain(-6),
      q: 3,
      bypass: false,
    });
    expect(
      process(eq, createSignal({ frames: 2000, frequency: 1000 })),
    ).toEqual(process(fresh, createSignal({ frames: 2000, frequency: 1000 })));
  });
});

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

describe(calculateBiquadEqResponse, () => {
  it.each([-18, -6, 0, 6, 18])(
    "returns %s dB at the center frequency",
    (gainDb) => {
      expect(
        calculateResponse({
          gainDb,
          responseFrequency: 1000,
          eqFrequency: 1000,
          q: 1,
        }),
      ).toBeCloseTo(gainDb, 10);
    },
  );

  it("matches the processed response away from the center frequency", () => {
    const parameters = {
      gainDb: 12,
      responseFrequency: 2400,
      eqFrequency: 1000,
      q: 2,
    };
    expect(calculateResponse(parameters)).toBeCloseTo(
      measureResponse({
        gain: dbToGain(parameters.gainDb),
        signalFrequency: parameters.responseFrequency,
        eqFrequency: parameters.eqFrequency,
        q: parameters.q,
      }),
      3,
    );
  });

  it("reflects Q in the response bandwidth", () => {
    const wide = calculateResponse({
      gainDb: 12,
      responseFrequency: 1500,
      eqFrequency: 1000,
      q: 1,
    });
    const narrow = calculateResponse({
      gainDb: 12,
      responseFrequency: 1500,
      eqFrequency: 1000,
      q: 8,
    });
    expect(wide).toBeGreaterThan(narrow);
  });
});

function calculateResponse({
  gainDb,
  responseFrequency,
  eqFrequency,
  q,
}: {
  gainDb: number;
  responseFrequency: number;
  eqFrequency: number;
  q: number;
}): number {
  const coefficients = calculateBiquadEqCoefficients({
    sampleRate: SAMPLE_RATE,
    frequency: eqFrequency,
    gain: dbToGain(gainDb),
    q,
  });
  return gainToDb(
    calculateBiquadEqResponse({
      coefficients,
      sampleRate: SAMPLE_RATE,
      frequency: responseFrequency,
    }),
  );
}

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

function process(
  eq: Pick<BiquadEq, "process">,
  input: Float32Array,
): Float32Array {
  const output = new Float32Array(input.length);
  eq.process({ input: [input], output: [output] });
  return output;
}

function measureResponse({
  gain,
  signalFrequency,
  eqFrequency,
  q,
}: {
  gain: number;
  signalFrequency: number;
  eqFrequency: number;
  q: number;
}): number {
  const input = createSignal({
    frames: SAMPLE_RATE,
    frequency: signalFrequency,
  });
  const output = process(
    new BiquadEq({
      sampleRate: SAMPLE_RATE,
      channelCount: 1,
      frequency: eqFrequency,
      gain,
      q,
      bypass: false,
    }),
    input,
  );
  return (
    10 *
    Math.log10(
      measureEnergy(output.subarray(SAMPLE_RATE / 2)) /
        measureEnergy(input.subarray(SAMPLE_RATE / 2)),
    )
  );
}

function measureEnergy(signal: Float32Array): number {
  let energy = 0;
  for (const sample of signal) {
    energy += sample ** 2;
  }
  return energy;
}
