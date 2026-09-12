import type { PitchShifterCommand } from "./pitch-shifter-node.ts";
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
  private shifter?: StreamingPitchShifter;
  private readonly channelCount: number;
  private pitchRatio: number;
  private readonly silence: Float32Array[];

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    const { channelCount, pitchRatio } = options!
      .processorOptions as ProcessorOptions;
    this.channelCount = channelCount;
    this.pitchRatio = pitchRatio;
    this.silence = Array.from(
      { length: channelCount },
      () => new Float32Array(BLOCK_FRAMES),
    );
    this.reset();
    this.port.onmessage = (event: MessageEvent<PitchShifterCommand>) => {
      switch (event.data.type) {
        case "setPitchRatio": {
          this.pitchRatio = event.data.pitchRatio;
          this.reset();
          break;
        }
        case "reset": {
          this.reset();
          break;
        }
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0] ?? [];
    const output = outputs[0] ?? [];
    if (output.length === 0) {
      return true;
    }
    if (!this.shifter) {
      for (const [index, channel] of output.entries()) {
        channel.set(input[index] ?? this.silence[index]);
      }
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

  private reset(): void {
    this.shifter =
      this.pitchRatio === 1
        ? undefined
        : new StreamingPitchShifter({
            channelCount: this.channelCount,
            sampleRate,
            pitchRatio: this.pitchRatio,
            blockFrames: BLOCK_FRAMES,
            windowSeconds: WINDOW_SECONDS,
            searchSeconds: SEARCH_SECONDS,
          });
  }
}

registerProcessor(PROCESSOR_NAME, PitchShifterProcessor);
