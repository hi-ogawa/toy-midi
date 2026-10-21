import { describe, expect, it } from "vitest";
import { dbToGain, gainToDb } from "../music";
import {
  type BiquadFilterSpec,
  BUTTERWORTH_Q,
  calculateBiquadEqCoefficients,
  calculateBiquadEqResponse,
  DEFAULT_PARAMETERS,
  BiquadEq,
} from "./biquad-eq";
import { MultibandEq } from "./biquad-eq-multiband";
import { createSine, SAMPLE_RATE } from "./helper";

describe(BiquadEq, () => {
  it.each([-18, -6, 6, 18])(
    "applies %s dB at the center frequency",
    (gainDb) => {
      expect(
        measureResponse(
          { type: "peaking", frequency: 1000, gain: dbToGain(gainDb), q: 1 },
          1000,
        ),
      ).toBeCloseTo(gainDb, 3);
    },
  );

  it("narrows the bandwidth as Q increases and preserves distant frequencies", () => {
    expect(
      measureResponse(
        { type: "peaking", frequency: 1500, gain: dbToGain(12), q: 1 },
        1000,
      ),
    ).toBeGreaterThan(
      measureResponse(
        { type: "peaking", frequency: 1500, gain: dbToGain(12), q: 8 },
        1000,
      ),
    );
    expect(
      measureResponse(
        { type: "peaking", frequency: 1500, gain: dbToGain(12), q: 1 },
        20,
      ),
    ).toBeCloseTo(0, 1);
    expect(
      measureResponse(
        { type: "peaking", frequency: 1500, gain: dbToGain(12), q: 1 },
        20000,
      ),
    ).toBeCloseTo(0, 1);
  });

  it("ramps gain rather than switching immediately", () => {
    const eq = new BiquadEq(
      { sampleRate: SAMPLE_RATE, channelCount: 1 },
      { type: "peaking", ...DEFAULT_PARAMETERS },
    );
    eq.setParameters({ gain: dbToGain(18) });
    const input = createSine({ length: 2000, frequency: 1000 });
    const ramped = process(eq, input);
    const immediate = process(
      new BiquadEq(
        { sampleRate: SAMPLE_RATE, channelCount: 1 },
        { type: "peaking", ...DEFAULT_PARAMETERS, gain: dbToGain(18) },
      ),
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
    const eq = new BiquadEq(
      { sampleRate: SAMPLE_RATE, channelCount: 1 },
      { type: "peaking", ...DEFAULT_PARAMETERS, gain: dbToGain(18) },
    );
    process(eq, createSine({ length: 100, frequency: 1000 }));
    eq.setParameters({ frequency: 3000, gain: dbToGain(-6), q: 3 });
    eq.reset();
    const fresh = new BiquadEq(
      { sampleRate: SAMPLE_RATE, channelCount: 1 },
      {
        type: "peaking",
        frequency: 3000,
        gain: dbToGain(-6),
        q: 3,
      },
    );
    expect(process(eq, createSine({ length: 2000, frequency: 1000 }))).toEqual(
      process(fresh, createSine({ length: 2000, frequency: 1000 })),
    );
  });

  it.each([
    { type: "low-pass", passband: 100, stopband: 10000 },
    { type: "high-pass", passband: 10000, stopband: 100 },
  ] as const)(
    "puts a Butterworth $type 3 dB down at its cutoff",
    ({ type, passband, stopband }) => {
      const spec = { type, frequency: 1000, q: BUTTERWORTH_Q };
      expect(measureResponse(spec, 1000)).toBeCloseTo(
        gainToDb(Math.SQRT1_2),
        3,
      );
      expect(measureResponse(spec, passband)).toBeCloseTo(0, 1);
      expect(measureResponse(spec, stopband)).toBeLessThan(-35);
    },
  );
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
      measureResponse(
        {
          type: "peaking",
          frequency: parameters.eqFrequency,
          gain: dbToGain(parameters.gainDb),
          q: parameters.q,
        },
        parameters.responseFrequency,
      ),
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

describe(MultibandEq, () => {
  it("cascades band gains", () => {
    const eq = new MultibandEq({
      sampleRate: SAMPLE_RATE,
      channelCount: 1,
      parameters: {
        bypass: false,
        bands: ["a", "b"].map((id) => ({
          id,
          type: "peaking" as const,
          ...DEFAULT_PARAMETERS,
          gain: 2,
        })),
      },
    });
    const input = createSine({ length: SAMPLE_RATE, frequency: 1000 });
    const output = process(eq, input);
    // Two bands double amplitude twice, so the energy ratio is (2 * 2) ** 2 = 16.
    expect(
      measureEnergy(output.subarray(SAMPLE_RATE / 2)) /
        measureEnergy(input.subarray(SAMPLE_RATE / 2)),
    ).toBeCloseTo(16, 3);
  });

  it("reconciles updates by band ID without resetting its ramp", () => {
    const eq = new MultibandEq({
      sampleRate: SAMPLE_RATE,
      channelCount: 1,
      parameters: {
        bypass: false,
        bands: [{ id: "band", type: "peaking", ...DEFAULT_PARAMETERS }],
      },
    });
    eq.setParameters({
      bypass: false,
      bands: [
        {
          id: "band",
          type: "peaking",
          ...DEFAULT_PARAMETERS,
          gain: dbToGain(18),
        },
      ],
    });
    const input = createSine({ length: 100, frequency: 1000 });
    const ramped = process(eq, input);
    const replaced = process(
      new MultibandEq({
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
        parameters: {
          bypass: false,
          bands: [
            {
              id: "replacement",
              type: "peaking",
              ...DEFAULT_PARAMETERS,
              gain: dbToGain(18),
            },
          ],
        },
      }),
      input,
    );
    expect(measureEnergy(ramped) / measureEnergy(replaced)).toBeLessThan(0.5);
  });

  it("builds a new filter when a band changes type", () => {
    const band = {
      id: "band",
      ...DEFAULT_PARAMETERS,
      gain: dbToGain(6),
      bypass: false,
    };
    const eq = new MultibandEq({
      sampleRate: SAMPLE_RATE,
      channelCount: 1,
      parameters: { bypass: false, bands: [{ ...band, type: "peaking" }] },
    });
    eq.setParameters({
      bypass: false,
      bands: [{ ...band, type: "high-pass", q: BUTTERWORTH_Q }],
    });
    // A decade below its 1 kHz cutoff, the high-pass falls 12 dB per octave
    // for 3.3 octaves, and the band's 6 dB gain doesn't apply.
    const input = createSine({ length: SAMPLE_RATE, frequency: 100 });
    const output = process(eq, input);
    expect(
      gainToDb(
        Math.sqrt(
          measureEnergy(output.subarray(SAMPLE_RATE / 2)) /
            measureEnergy(input.subarray(SAMPLE_RATE / 2)),
        ),
      ),
    ).toBeCloseTo(-40, 0);
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
  const coefficients = calculateBiquadEqCoefficients(
    { sampleRate: SAMPLE_RATE },
    { type: "peaking", frequency: eqFrequency, gain: dbToGain(gainDb), q },
  );
  return gainToDb(
    calculateBiquadEqResponse({
      coefficients,
      sampleRate: SAMPLE_RATE,
      frequency: responseFrequency,
    }),
  );
}

function process(
  eq: Pick<BiquadEq, "process">,
  input: Float32Array,
): Float32Array {
  const output = new Float32Array(input.length);
  eq.process([input], [output]);
  return output;
}

function measureResponse(
  spec: BiquadFilterSpec,
  signalFrequency: number,
): number {
  const input = createSine({ length: SAMPLE_RATE, frequency: signalFrequency });
  const output = process(
    new BiquadEq({ sampleRate: SAMPLE_RATE, channelCount: 1 }, spec),
    input,
  );
  // Measure only the last half second, after the transient from the sine's
  // sudden start has died out.
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
