import { describe, expect, it, vi } from "vitest";
import { AudioAnalyser } from "./audio-analyser";

describe("AudioAnalyser", () => {
  it("publishes RMS and absolute peak from the analyser window", () => {
    const node = new TestAnalyserNode();
    const analyser = new AudioAnalyser({
      createAnalyser: () => node,
      sampleRate: 48_000,
    } as unknown as BaseAudioContext);
    let firstFrame: FrameRequestCallback | undefined;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      firstFrame ??= callback;
      return 1;
    });
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    node.samples = new Float32Array(2048);
    for (let index = 0; index < node.samples.length; index += 4) {
      node.samples.set([-1, 0, 1, 0], index);
    }
    const onAnalysis = vi.fn();

    const unsubscribe = analyser.subscribe(onAnalysis);
    firstFrame?.(0);

    expect(onAnalysis).toHaveBeenCalledWith({
      rms: Math.SQRT1_2,
      peak: 1,
    });
    unsubscribe();
    vi.unstubAllGlobals();
  });
});

class TestAnalyserNode {
  fftSize = 0;
  samples = new Float32Array();

  getFloatTimeDomainData(output: Float32Array): void {
    output.fill(0);
    output.set(this.samples);
  }

  disconnect(): void {}
}
