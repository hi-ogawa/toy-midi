import { startThrottledAnimationFrameLoop } from "../utils/timing.ts";

export type AudioAnalysis = {
  peak: number;
};

export class AudioAnalyser {
  readonly node: AnalyserNode;

  private readonly samples: Float32Array<ArrayBuffer>;
  private readonly sampleInterval: number;

  constructor(context: BaseAudioContext) {
    this.node = context.createAnalyser();
    // Match the old worklet cadence of 16 render quanta. The analyser window is
    // 16 * 128 samples, so one window at the actual context rate is the intended
    // approximate UI update interval.
    this.node.fftSize = 2048;
    this.samples = new Float32Array(this.node.fftSize);
    this.sampleInterval = (this.node.fftSize / context.sampleRate) * 1000;
  }

  subscribe(onAnalysis: (analysis: AudioAnalysis) => void): () => void {
    return startThrottledAnimationFrameLoop({
      interval: this.sampleInterval,
      callback: () => {
        this.node.getFloatTimeDomainData(this.samples);
        let peak = 0;
        for (const sample of this.samples) {
          peak = Math.max(peak, Math.abs(sample));
        }
        onAnalysis({ peak });
      },
    });
  }

  dispose(): void {
    this.node.disconnect();
  }
}
