import { type EqParameters, BiquadEq } from "./eq.ts";

const PROCESSOR_NAME = "biquad-eq";

type ProcessorOptions = {
  channelCount: number;
  parameters: EqParameters;
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

class BiquadEqProcessor extends AudioWorkletProcessor {
  private readonly eq: BiquadEq;

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    const { channelCount, parameters } = options!
      .processorOptions as ProcessorOptions;
    this.eq = new BiquadEq({ sampleRate, channelCount, ...parameters });
    this.port.onmessage = (event: MessageEvent<Partial<EqParameters>>) => {
      this.eq.setParameters(event.data);
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0] ?? [];
    const output = outputs[0] ?? [];
    if (input.length === 0 || output.length === 0) {
      return true;
    }
    this.eq.process({ input, output });
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, BiquadEqProcessor);
