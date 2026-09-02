import type { AudioAnalyserSource, AudioAnalysis } from "../audio-analyser.ts";

const PROCESSOR_NAME = "faust-capture-meter";

export class FaustCaptureAnalyser implements AudioAnalyserSource {
  readonly node: AudioWorkletNode;
  private readonly listeners = new Set<(analysis: AudioAnalysis) => void>();

  constructor(context: AudioContext) {
    this.node = new AudioWorkletNode(context, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.node.port.onmessage = (
      event: MessageEvent<{ type: "analysis"; peak: number }>,
    ) => {
      for (const listener of this.listeners) {
        listener({ peak: event.data.peak });
      }
    };
  }

  subscribe(listener: (analysis: AudioAnalysis) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
    this.node.disconnect();
  }
}
