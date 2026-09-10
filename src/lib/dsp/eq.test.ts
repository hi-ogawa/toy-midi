import { describe, expect, it } from "vitest";
import { PeakingEq } from "./eq";

const sampleRate = 48000;
const defaultParameters = {
  frequency: 1000,
  gain: 1,
  q: 1,
  bypass: false,
};

describe(PeakingEq, () => {
  it.each([-18, -6, 6, 18])(
    "applies %s dB at the center frequency",
    (gainDb) => {
      expect(response({ gain: dbToGain(gainDb), frequency: 1000 })).toBeCloseTo(
        gainDb,
        3,
      );
    },
  );

  it("narrows the bandwidth as Q increases and preserves distant frequencies", () => {
    expect(
      response({ gain: dbToGain(12), frequency: 1000, centerFrequency: 1500 }),
    ).toBeGreaterThan(
      response({
        gain: dbToGain(12),
        frequency: 1000,
        centerFrequency: 1500,
        q: 8,
      }),
    );
    expect(
      response({ gain: dbToGain(12), frequency: 20, centerFrequency: 1500 }),
    ).toBeCloseTo(0, 1);
    expect(
      response({ gain: dbToGain(12), frequency: 20000, centerFrequency: 1500 }),
    ).toBeCloseTo(0, 1);
  });

  it("is exactly transparent at unity gain", () => {
    const eq = new PeakingEq({
      sampleRate,
      channelCount: 1,
      ...defaultParameters,
    });
    const input = signal(2048);
    expect(process(eq, input)).toEqual(input);
    eq.setParameters({ gain: dbToGain(18) });
    process(eq, input);
    eq.setParameters({ gain: 1 });
    const output = process(eq, input);
    expect(output.slice(480)).toEqual(input.slice(480));
  });

  it("keeps independent histories and supports in-place stereo processing", () => {
    const eq = new PeakingEq({
      sampleRate,
      channelCount: 2,
      ...defaultParameters,
      gain: dbToGain(12),
    });
    const left = signal(2048);
    const expected = process(
      new PeakingEq({
        sampleRate,
        channelCount: 1,
        ...defaultParameters,
        gain: dbToGain(12),
      }),
      left,
    );
    const buffers = [left, new Float32Array(left.length)];
    eq.process({ input: buffers, output: buffers });
    expect(buffers[0]).toEqual(expected);
    expect(buffers[1].every((x) => x === 0)).toBe(true);
  });

  it("produces identical ramps regardless of block boundaries or repeated targets", () => {
    const render = (blockSize: number) => {
      const eq = new PeakingEq({
        sampleRate,
        channelCount: 1,
        ...defaultParameters,
      });
      const input = signal(3000);
      const output = new Float32Array(input.length);
      for (let offset = 0; offset < input.length; offset += blockSize) {
        eq.setParameters({ frequency: 6000, gain: dbToGain(18), q: 0.2 });
        eq.process({
          input: [input.subarray(offset, offset + blockSize)],
          output: [output.subarray(offset, offset + blockSize)],
        });
      }
      return output;
    };
    expect(render(128)).toEqual(render(3000));
    expect(render(1)).toEqual(render(3000));
  });

  it("ramps gain and bypass rather than switching immediately", () => {
    const eq = new PeakingEq({
      sampleRate,
      channelCount: 1,
      ...defaultParameters,
    });
    eq.setParameters({ gain: dbToGain(18) });
    const input = signal(2000);
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
    const input = signal(2000);
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
    process(eq, signal(100));
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
    expect(process(eq, signal(2000))).toEqual(process(fresh, signal(2000)));
  });

  it.each([8000, 44100, 48000, 96000])(
    "clamps parameters and stays finite at %s Hz",
    (rate) => {
      for (const frequency of [20, 20000]) {
        for (const gainDb of [-18, 18]) {
          for (const q of [0.1, 18]) {
            const eq = new PeakingEq({
              sampleRate: rate,
              channelCount: 1,
              frequency,
              gain: dbToGain(gainDb),
              q,
              bypass: false,
            });
            const output = process(eq, signal(rate));
            expect(output.every(Number.isFinite)).toBe(true);
            expect(Math.max(...output.map(Math.abs))).toBeLessThan(20);
          }
        }
      }
      const clamped = new PeakingEq({
        sampleRate: rate,
        channelCount: 1,
        frequency: 1e6,
        gain: 100,
        q: -1,
        bypass: false,
      });
      const explicit = new PeakingEq({
        sampleRate: rate,
        channelCount: 1,
        frequency: Math.min(20000, rate * 0.499),
        gain: dbToGain(18),
        q: 0.1,
        bypass: false,
      });
      expect(process(clamped, signal(2000))).toEqual(
        process(explicit, signal(2000)),
      );
    },
  );

  it("rejects invalid configuration and buffers without poisoning state", () => {
    expect(
      () =>
        new PeakingEq({
          sampleRate: 0,
          channelCount: 1,
          ...defaultParameters,
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new PeakingEq({
          sampleRate,
          channelCount: 0,
          ...defaultParameters,
        }),
    ).toThrow(RangeError);
    const eq = new PeakingEq({
      sampleRate,
      channelCount: 1,
      ...defaultParameters,
    });
    expect(() => eq.setParameters({ frequency: 500, gain: NaN })).toThrow(
      RangeError,
    );
    expect(() => eq.process({ input: [signal(10)], output: [] })).toThrow(
      RangeError,
    );
    expect(() =>
      eq.process({ input: [signal(10)], output: [signal(5)] }),
    ).toThrow(RangeError);
    expect(process(eq, signal(100))).toEqual(signal(100));
  });
});

function signal(frames: number): Float32Array {
  return Float32Array.from({ length: frames }, (_, i) =>
    Math.sin((2 * Math.PI * 1000 * i) / sampleRate),
  );
}

function process(eq: PeakingEq, input: Float32Array): Float32Array {
  const output = new Float32Array(input.length);
  eq.process({ input: [input], output: [output] });
  return output;
}

function response({
  gain,
  frequency,
  centerFrequency = frequency,
  q = 1,
}: {
  gain: number;
  frequency: number;
  centerFrequency?: number;
  q?: number;
}): number {
  const input = Float32Array.from({ length: sampleRate }, (_, i) =>
    Math.sin((2 * Math.PI * frequency * i) / sampleRate),
  );
  const output = process(
    new PeakingEq({
      sampleRate,
      channelCount: 1,
      frequency: centerFrequency,
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
