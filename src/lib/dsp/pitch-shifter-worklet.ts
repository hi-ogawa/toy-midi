import { StreamingPitchShifter } from "./pitch-shifter.ts";

const PROCESSOR_NAME = "pitch-shifter";
const BLOCK_FRAMES = 128;
const WINDOW_SECONDS = 0.02;
const SEARCH_SECONDS = 0.03;

type ProcessorOptions = {
  channelCount: number;
  pitchRatio: number;
};

declare const AudioWorkletProcessor: new (
  options?: AudioWorkletNodeOptions,
) => {
  readonly port: MessagePort;
};
declare const sampleRate: number;
declare function registerProcessor(
  name: string,
  processorCtor: typeof AudioWorkletProcessor,
): void;

class PitchShifterProcessor extends AudioWorkletProcessor {
  private readonly shifter: StreamingPitchShifter;
  private readonly silence: Float32Array[];

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    const { channelCount, pitchRatio } = options!
      .processorOptions as ProcessorOptions;
    this.silence = Array.from(
      { length: channelCount },
      () => new Float32Array(BLOCK_FRAMES),
    );
    this.shifter = new StreamingPitchShifter({
      channelCount,
      sampleRate,
      pitchRatio,
      blockFrames: BLOCK_FRAMES,
      windowSeconds: WINDOW_SECONDS,
      searchSeconds: SEARCH_SECONDS,
    });
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0] ?? [];
    const output = outputs[0] ?? [];
    if (output.length === 0) {
      return true;
    }
    // Keep the stream clock advancing and drain buffered audio between sources.
    this.shifter.push(input.length > 0 ? input : this.silence);
    const written = this.shifter.pull(output);
    for (const channel of output) {
      channel.fill(0, written);
    }
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, PitchShifterProcessor);
