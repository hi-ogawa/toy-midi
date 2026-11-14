import { describe, expect, it } from "vitest";
import { BiquadEq, BUTTERWORTH_Q } from "./biquad-eq";
import { SAMPLE_RATE } from "./helper";
import { Reverb, REVERB_PARAMETERS } from "./reverb";

describe(Reverb, () => {
  it("decays in about the set time at low frequencies and faster at high ones", () => {
    const [left, right] = runImpulse(4);
    const frequencies = [250, 1000, 4000, 8000];
    const decayTimes = frequencies.map(
      (frequency) =>
        (measureDecayTime(filterOctave(left, frequency)) +
          measureDecayTime(filterOctave(right, frequency))) /
        2,
    );
    expect(
      frequencies
        .map((frequency, i) => `${frequency} Hz: ${decayTimes[i].toFixed(2)} s`)
        .join("\n"),
    ).toMatchInlineSnapshot(`
      "250 Hz: 1.97 s
      1000 Hz: 1.96 s
      4000 Hz: 1.74 s
      8000 Hz: 1.50 s"
    `);
    const { decayTime } = REVERB_PARAMETERS;
    expect(decayTimes[0]).toBeGreaterThan(decayTime);
    expect(decayTimes[0]).toBeLessThan(decayTime * 1.1);
    expect(decayTimes[3]).toBeLessThan(decayTimes[0] * 0.8);
  });

  it("decorrelates the left and right outputs", () => {
    const [left, right] = runImpulse(2).map((channel) =>
      channel.slice(0.05 * SAMPLE_RATE),
    );
    expect(Math.abs(measureCorrelation(left, right))).toBeLessThan(0.1);
  });

  it("decays to exact silence without denormals", () => {
    const seconds = 30;
    const channels = runImpulse(seconds);
    for (const channel of channels) {
      // The peak falls second by second, so the loop isn't gaining.
      const peaks = Array.from({ length: seconds }, (_, second) =>
        measurePeak(
          channel.subarray(second * SAMPLE_RATE, (second + 1) * SAMPLE_RATE),
        ),
      );
      const nonzero = peaks.filter((peak) => peak > 0);
      for (let i = 1; i < nonzero.length; i++) {
        expect(nonzero[i]).toBeLessThan(nonzero[i - 1]);
      }
      expect(peaks.at(-1)).toBe(0);
      const smallestNormal = 2 ** -126;
      expect(channel.some((y) => y !== 0 && Math.abs(y) < smallestNormal)).toBe(
        false,
      );
    }
  });
});

function runImpulse(seconds: number): Float32Array[] {
  const length = seconds * SAMPLE_RATE;
  const reverb = new Reverb({
    sampleRate: SAMPLE_RATE,
    blockFrames: length,
    parameters: REVERB_PARAMETERS,
  });
  const input = new Float32Array(length);
  input[0] = 1;
  const output = [new Float32Array(length), new Float32Array(length)];
  reverb.process([input], output);
  return output;
}

/** The octave band around a frequency, by a high-pass and a low-pass. */
function filterOctave(samples: Float32Array, frequency: number): Float32Array {
  const output = samples.slice();
  for (const spec of [
    { type: "high-pass", frequency: frequency / Math.SQRT2 },
    { type: "low-pass", frequency: frequency * Math.SQRT2 },
  ] as const) {
    const filter = new BiquadEq(
      { sampleRate: SAMPLE_RATE, channelCount: 1 },
      { ...spec, q: BUTTERWORTH_Q },
    );
    filter.process([output], [output]);
  }
  return output;
}

/**
 * Seconds to fall 60 dB, extrapolated from the fall from −5 to −35 dB of the
 * energy still to come at each sample, which smooths the decay into a line
 * (Schroeder's backward integration).
 */
function measureDecayTime(samples: Float32Array): number {
  const remaining = new Float64Array(samples.length);
  let sum = 0;
  for (let i = samples.length - 1; i >= 0; i--) {
    sum += samples[i] ** 2;
    remaining[i] = sum;
  }
  const levelDb = (i: number) => 10 * Math.log10(remaining[i] / remaining[0]);
  const findTime = (db: number) => {
    let i = 0;
    while (levelDb(i) > db) {
      i++;
    }
    return i / SAMPLE_RATE;
  };
  return ((findTime(-35) - findTime(-5)) * 60) / 30;
}

function measureCorrelation(a: Float32Array, b: Float32Array): number {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += a[i] * b[i];
    aa += a[i] ** 2;
    bb += b[i] ** 2;
  }
  return ab / Math.sqrt(aa * bb);
}

function measurePeak(samples: Float32Array): number {
  let peak = 0;
  for (const y of samples) {
    peak = Math.max(peak, Math.abs(y));
  }
  return peak;
}
