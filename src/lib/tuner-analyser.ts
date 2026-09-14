import { startThrottledAnimationFrameLoop } from "../utils/timing.ts";
import { analyzeTunerSamples, type TunerAnalysis } from "./tuner-analysis.ts";

const WINDOW_SIZE = 4096;
const UPDATE_INTERVAL_MS = 50;

export class TunerAnalyser {
  readonly node: AnalyserNode;

  private readonly samples = new Float32Array(WINDOW_SIZE);
  private readonly sampleRate: number;

  constructor(context: BaseAudioContext) {
    this.node = context.createAnalyser();
    this.node.fftSize = WINDOW_SIZE;
    this.sampleRate = context.sampleRate;
  }

  subscribe(onAnalysis: (analysis: TunerAnalysis) => void): () => void {
    return startThrottledAnimationFrameLoop({
      interval: UPDATE_INTERVAL_MS,
      callback: () => {
        this.node.getFloatTimeDomainData(this.samples);
        onAnalysis(
          analyzeTunerSamples({
            samples: this.samples,
            sampleRate: this.sampleRate,
          }),
        );
      },
    });
  }

  dispose(): void {
    this.node.disconnect();
  }
}
