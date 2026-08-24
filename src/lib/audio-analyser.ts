import { startAnimationFrameLoop } from "../utils/timing.ts";

export type AudioAnalysis = {
  rms: number;
  peak: number;
};

export class AudioAnalyser {
  readonly node: AnalyserNode;

  private readonly samples: Float32Array<ArrayBuffer>;
  private readonly sampleInterval: number;

  constructor(context: BaseAudioContext) {
    this.node = context.createAnalyser();
    this.node.fftSize = 2048;
    this.samples = new Float32Array(this.node.fftSize);
    // Match the old worklet cadence of 16 render quanta. The analyser window is
    // 16 * 128 samples, so one window at the actual context rate is the intended
    // approximate UI update interval.
    this.sampleInterval = (this.node.fftSize / context.sampleRate) * 1000;
  }

  subscribe(onAnalysis: (analysis: AudioAnalysis) => void): () => void {
    let lastSampleTime = -Infinity;
    return startAnimationFrameLoop((time) => {
      if (time - lastSampleTime < this.sampleInterval) {
        return;
      }
      lastSampleTime = time;
      this.node.getFloatTimeDomainData(this.samples);
      let sumSquares = 0;
      let peak = 0;
      for (const sample of this.samples) {
        sumSquares += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      onAnalysis({
        rms: Math.sqrt(sumSquares / this.samples.length),
        peak,
      });
    });
  }

  dispose(): void {
    this.node.disconnect();
  }
}
