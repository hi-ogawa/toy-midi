import { describe, expect, it } from "vitest";
import { AnalyserMeter, measureSamples } from "./audio-meter";

describe("measureSamples", () => {
  it("calculates RMS and absolute sample peak", () => {
    expect(measureSamples(new Float32Array([-1, 0, 1, 0]))).toEqual({
      rms: Math.SQRT1_2,
      peak: 1,
    });
  });

  it("returns silence for an empty window", () => {
    expect(measureSamples(new Float32Array())).toEqual({ rms: 0, peak: 0 });
  });
});

describe("AnalyserMeter", () => {
  it("holds recent peaks and latches clipping", () => {
    const analyser = new TestAnalyserNode();
    const meter = new AnalyserMeter({
      createAnalyser: () => analyser,
    } as unknown as BaseAudioContext);

    analyser.value = 1;
    const loud = meter.read(0);
    expect(loud.rms).toBeGreaterThan(0);
    expect(loud.peak).toBe(1);
    expect(loud.peakHold).toBe(1);
    expect(loud.clipped).toBe(true);

    analyser.value = 0;
    const held = meter.read(1_000);
    expect(held.peak).toBeLessThan(1);
    expect(held.peakHold).toBe(1);

    const released = meter.read(2_000);
    expect(released.peakHold).toBe(released.peak);
    expect(released.clipped).toBe(true);

    meter.resetClip();
    expect(meter.read(2_000).clipped).toBe(false);
  });
});

class TestAnalyserNode {
  fftSize = 0;
  smoothingTimeConstant = 0;
  value = 0;

  getFloatTimeDomainData(samples: Float32Array): void {
    samples.fill(this.value);
  }

  disconnect(): void {}
}
