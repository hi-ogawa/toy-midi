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
  static get parameterDescriptors() {
    return [
      {
        name: "disposed",
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
    ];
  }

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

  // Chromium stops invoking this processor without a true return value.
  // Keep it alive through pauses so the same EQ can process resumed playback.
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    // End forced activity on permanent teardown.
    // https://webaudio.github.io/web-audio-api/#callback-audioworketprocess-callback
    if (parameters.disposed[0] >= 0.5) {
      return false;
    }
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
