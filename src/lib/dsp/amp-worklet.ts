import { Amp, type AmpParameters } from "./amp.ts";
import { watchWorkletDisposal } from "./worklet-disposal.ts";

const PROCESSOR_NAME = "amp";
// The Web Audio render quantum.
const BLOCK_FRAMES = 128;

type ProcessorOptions = {
  parameters: AmpParameters;
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

class AmpProcessor extends AudioWorkletProcessor {
  private readonly isDisposed = watchWorkletDisposal(this.port);
  private readonly amp: Amp;

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    const { parameters } = options!.processorOptions as ProcessorOptions;
    this.amp = new Amp({ sampleRate, blockFrames: BLOCK_FRAMES, parameters });
    this.port.onmessage = (event: MessageEvent<AmpParameters>) => {
      this.amp.setParameters(event.data);
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.isDisposed()) {
      return false;
    }
    const input = inputs[0] ?? [];
    const output = outputs[0] ?? [];
    if (input.length === 0 || output.length === 0) {
      return true;
    }
    this.amp.process(input, output);
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, AmpProcessor);
