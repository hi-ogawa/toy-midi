import { describe, expect, it } from "vitest";
import { type EqParameters, PeakingEq } from "./eq";

const sampleRate = 48000;
const defaultParameters: EqParameters = {
  frequency: 1000,
  gain: 1,
  q: 1,
  bypass: false,
};

describe(PeakingEq, () => {
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

  it("ramps gain and bypass rather than switching immediately", () => {
    const eq = new PeakingEq({
      sampleRate,
      channelCount: 1,
      ...defaultParameters,
    });
    eq.setParameters({ gain: dbToGain(18) });
    const input = createSignal({ frames: 2000, frequency: 1000 });
    const ramped = process(eq, input);
    const immediate = process(
      new PeakingEq({
        sampleRate,
        channelCount: 1,
        ...defaultParameters,
        gain: dbToGain(18),
      }),
      input,
    );
    expect(Math.abs(ramped[1] - input[1])).toBeLessThan(
      Math.abs(immediate[1] - input[1]) / 10,
    );
    eq.setParameters({ bypass: true });
    const bypassed = process(eq, input);
    expect(bypassed.slice(480)).toEqual(input.slice(480));
    expect(bypassed.slice(0, 100)).not.toEqual(input.slice(0, 100));
  });

  it("keeps history current while bypassed", () => {
    const eq = new PeakingEq({
      sampleRate,
      channelCount: 1,
      ...defaultParameters,
      gain: dbToGain(12),
      bypass: true,
    });
    const reference = new PeakingEq({
      sampleRate,
      channelCount: 1,
      ...defaultParameters,
      gain: dbToGain(12),
    });
    const input = createSignal({ frames: 2000, frequency: 1000 });
    expect(process(eq, input)).toEqual(input);
    process(reference, input);
    eq.setParameters({ bypass: false });
    expect(process(eq, input).slice(480)).toEqual(
      process(reference, input).slice(480),
    );
  });

  it("resets history and settles pending parameters", () => {
    const eq = new PeakingEq({
      sampleRate,
      channelCount: 1,
      ...defaultParameters,
      gain: dbToGain(18),
    });
    process(eq, createSignal({ frames: 100, frequency: 1000 }));
    eq.setParameters({ frequency: 3000, gain: dbToGain(-6), q: 3 });
    eq.reset();
    const fresh = new PeakingEq({
      sampleRate,
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

function createSignal({
  frames,
  frequency,
}: {
  frames: number;
  frequency: number;
}): Float32Array {
  return Float32Array.from({ length: frames }, (_, i) =>
    Math.sin((2 * Math.PI * frequency * i) / sampleRate),
  );
}

function process(eq: PeakingEq, input: Float32Array): Float32Array {
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
    frames: sampleRate,
    frequency: signalFrequency,
  });
  const output = process(
    new PeakingEq({
      sampleRate,
      channelCount: 1,
      frequency: eqFrequency,
      gain,
      q,
      bypass: false,
    }),
    input,
  );
  let inputEnergy = 0;
  let outputEnergy = 0;
  for (let i = sampleRate / 2; i < sampleRate; i++) {
    inputEnergy += input[i] ** 2;
    outputEnergy += output[i] ** 2;
  }
  return 10 * Math.log10(outputEnergy / inputEnergy);
}

function dbToGain(db: number): number {
  return 10 ** (db / 20);
}
