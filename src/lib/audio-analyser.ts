import { startThrottledAnimationFrameLoop } from "../utils/timing.ts";

export type AudioAnalysis = {
  peak: number;
};

/** Linear amplitude levels of one analysis window. */
export type AudioLevels = {
  peak: number;
  rms: number;
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
      callback: () => onAnalysis({ peak: this.measure().peak }),
    });
  }

  /** Measures the most recent analysis window. */
  measure(): AudioLevels {
    this.node.getFloatTimeDomainData(this.samples);
    let peak = 0;
    let sumOfSquares = 0;
    for (const sample of this.samples) {
      peak = Math.max(peak, Math.abs(sample));
      sumOfSquares += sample * sample;
    }
    return { peak, rms: Math.sqrt(sumOfSquares / this.samples.length) };
  }

  dispose(): void {
    this.node.disconnect();
  }
}

export class StereoAnalyser {
  readonly input: ChannelSplitterNode;
  private readonly channels: [AudioAnalyser, AudioAnalyser];

  constructor(context: BaseAudioContext) {
    this.input = context.createChannelSplitter(2);
    this.channels = [new AudioAnalyser(context), new AudioAnalyser(context)];
    this.channels.forEach((channel, index) =>
      this.input.connect(channel.node, index),
    );
  }

  measure(): [AudioLevels, AudioLevels] {
    return [this.channels[0].measure(), this.channels[1].measure()];
  }

  dispose(): void {
    this.input.disconnect();
    for (const channel of this.channels) {
      channel.dispose();
    }
  }
}
