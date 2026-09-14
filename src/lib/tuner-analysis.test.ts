import { describe, expect, it } from "vitest";
import { analyzeTunerSamples } from "./tuner-analysis.ts";

const SAMPLE_RATE = 48_000;
const WINDOW_SIZE = 4096;

describe(analyzeTunerSamples, () => {
  it("rejects silence before looking for pitch", () => {
    expect(
      analyzeTunerSamples({
        samples: new Float32Array(WINDOW_SIZE),
        sampleRate: SAMPLE_RATE,
      }),
    ).toMatchObject({ status: "silent" });
  });

  it.each([30.87, 41.2, 110, 440])("detects a %.2f Hz sine", (frequencyHz) => {
    const result = analyzeTunerSamples({
      samples: makeSignal((time) => Math.sin(2 * Math.PI * frequencyHz * time)),
      sampleRate: SAMPLE_RATE,
    });
    expect(result.status).toBe("pitched");
    if (result.status === "pitched") {
      expect(result.frequencyHz).toBeCloseTo(frequencyHz, 1);
      expect(result.confidence).toBeGreaterThan(0.9);
    }
  });

  it("detects the fundamental of a harmonic-rich bass signal", () => {
    const frequencyHz = 41.2;
    const result = analyzeTunerSamples({
      samples: makeSignal(
        (time) =>
          0.5 * Math.sin(2 * Math.PI * frequencyHz * time) +
          0.3 * Math.sin(2 * Math.PI * frequencyHz * 2 * time) +
          0.2 * Math.sin(2 * Math.PI * frequencyHz * 3 * time),
      ),
      sampleRate: SAMPLE_RATE,
    });
    expect(result.status).toBe("pitched");
    if (result.status === "pitched") {
      expect(result.frequencyHz).toBeCloseTo(frequencyHz, 1);
    }
  });

  it("does not mistake a dominant second harmonic for the fundamental", () => {
    const frequencyHz = 41.2;
    const result = analyzeTunerSamples({
      samples: makeSignal(
        (time) =>
          0.2 * Math.sin(2 * Math.PI * frequencyHz * time) +
          Math.sin(2 * Math.PI * frequencyHz * 2 * time),
      ),
      sampleRate: SAMPLE_RATE,
    });
    expect(result.status).toBe("pitched");
    if (result.status === "pitched") {
      expect(result.frequencyHz).toBeCloseTo(frequencyHz, 1);
    }
  });

  it("reports an audible aperiodic signal as unstable", () => {
    let randomState = 1;
    const result = analyzeTunerSamples({
      samples: makeSignal(() => {
        randomState = (randomState * 16_807) % 2_147_483_647;
        return (randomState / 2_147_483_647) * 2 - 1;
      }),
      sampleRate: SAMPLE_RATE,
    });
    expect(result.status).toBe("unstable");
  });
});

function makeSignal(sample: (time: number) => number): Float32Array {
  return Float32Array.from({ length: WINDOW_SIZE }, (_, frame) =>
    sample(frame / SAMPLE_RATE),
  );
}
