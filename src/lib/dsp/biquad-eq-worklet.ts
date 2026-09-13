import {
  type MultibandEqParameters,
  MultibandEq,
} from "./biquad-eq-multiband.ts";

const PROCESSOR_NAME = "biquad-eq";

type ProcessorOptions = {
  channelCount: number;
  parameters: MultibandEqParameters;
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
  private readonly eq: MultibandEq;

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    const { channelCount, parameters } = options!
      .processorOptions as ProcessorOptions;
    this.eq = new MultibandEq({ sampleRate, channelCount, parameters });
    this.port.onmessage = (event: MessageEvent<MultibandEqParameters>) => {
      this.eq.setParameters(event.data);
    };
  }

  // Omit a return value so active inputs determine the processor lifetime.
  // https://webaudio.github.io/web-audio-api/#callback-audioworketprocess-callback
  process(inputs: Float32Array[][], outputs: Float32Array[][]): void {
    const input = inputs[0] ?? [];
    const output = outputs[0] ?? [];
    if (input.length === 0 || output.length === 0) {
      return;
    }
    this.eq.process({ input, output });
  }
}

registerProcessor(PROCESSOR_NAME, BiquadEqProcessor);
