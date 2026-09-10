import { describe, expect, it } from "vitest";
import { dbToGain } from "../music";
import { BiquadEq, type EqParameters, type EqType } from "./eq";

const SAMPLE_RATE = 48000;
const DEFAULT_PARAMETERS: EqParameters = {
  type: "peaking",
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

  it.each([
    { type: "low-shelf" as const, low: 12, high: 0 },
    { type: "high-shelf" as const, low: 0, high: 12 },
  ])("applies the characteristic $type response", ({ type, low, high }) => {
    expect(
      measureResponse({
        type,
        gain: dbToGain(12),
        signalFrequency: 50,
        eqFrequency: 1000,
        q: 0.1,
      }),
    ).toBeCloseTo(low, 1);
    expect(
      measureResponse({
        type,
        gain: dbToGain(12),
        signalFrequency: 18000,
        eqFrequency: 1000,
        q: 18,
      }),
    ).toBeCloseTo(high, 1);
  });

  it.each([
    { type: "low-pass" as const, passFrequency: 100, stopFrequency: 10000 },
    { type: "high-pass" as const, passFrequency: 10000, stopFrequency: 100 },
  ])(
    "applies the characteristic $type response",
    ({ type, passFrequency, stopFrequency }) => {
      expect(
        measureResponse({
          type,
          gain: dbToGain(18),
          signalFrequency: passFrequency,
          eqFrequency: 1000,
          q: Math.SQRT1_2,
        }),
      ).toBeGreaterThan(-0.1);
      expect(
        measureResponse({
          type,
          gain: dbToGain(-18),
          signalFrequency: stopFrequency,
          eqFrequency: 1000,
          q: Math.SQRT1_2,
        }),
      ).toBeLessThan(-35);
    },
  );

  it("passes the center frequency with band-pass and rejects it with notch", () => {
    expect(
      measureResponse({
        type: "band-pass",
        gain: dbToGain(-18),
        signalFrequency: 1000,
        eqFrequency: 1000,
        q: 1,
      }),
    ).toBeCloseTo(0, 3);
    expect(
      measureResponse({
        type: "band-pass",
        gain: dbToGain(18),
        signalFrequency: 100,
        eqFrequency: 1000,
        q: 1,
      }),
    ).toBeLessThan(-15);
    expect(
      measureResponse({
        type: "notch",
        gain: dbToGain(18),
        signalFrequency: 1000,
        eqFrequency: 1000,
        q: 1,
      }),
    ).toBeLessThan(-100);
    expect(
      measureResponse({
        type: "notch",
        gain: dbToGain(-18),
        signalFrequency: 100,
        eqFrequency: 1000,
        q: 1,
      }),
    ).toBeGreaterThan(-0.1);
  });

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
      type: "peaking",
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

function process(eq: BiquadEq, input: Float32Array): Float32Array {
  const output = new Float32Array(input.length);
  eq.process({ input: [input], output: [output] });
  return output;
}

function measureResponse({
  gain,
  type = "peaking",
  signalFrequency,
  eqFrequency,
  q,
}: {
  gain: number;
  type?: EqType;
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
      type,
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
