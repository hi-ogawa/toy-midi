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

  // Keep returning true through pauses because AudioChannel reuses this EQ.
  // The spec allows false/undefined to let active inputs determine lifetime,
  // but our Chromium 151 probe stopped after one callback when the return was
  // omitted, before any explicit disconnection. Input gaps must not terminate
  // a processor that the owner still intends to use.
  // Conversely, disconnecting while returning true leaves the processor active.
  // On permanent teardown, the owner sets the disposed AudioParam and disconnects
  // the node, so this callback skips DSP and returns false to release activity.
  // https://webaudio.github.io/web-audio-api/#callback-audioworketprocess-callback
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
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
