import { registerRpcHandlers } from "../rpc/endpoint.ts";
import { type LoudnessMeasurement, LoudnessMeter } from "./loudness.ts";
import { watchWorkletDisposal } from "./worklet-disposal.ts";

const PROCESSOR_NAME = "loudness-meter";
const CHANNEL_COUNT = 2;
const RENDER_QUANTUM_FRAMES = 128;

export type LoudnessMeterRpc = {
  measure(): Promise<LoudnessMeasurement>;
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

class LoudnessMeterProcessor extends AudioWorkletProcessor {
  private readonly isDisposed = watchWorkletDisposal(this.port);
  private readonly meter = new LoudnessMeter({
    sampleRate,
    channelCount: CHANNEL_COUNT,
  });
  // An input whose sources haven't started arrives with no channels, but its
  // time still counts toward the 3 s windows of loudness range.
  private readonly silence = Array.from(
    { length: CHANNEL_COUNT },
    () => new Float32Array(RENDER_QUANTUM_FRAMES),
  );

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    registerRpcHandlers(this.port, {
      measure: async () => this.meter.measure(),
    } satisfies LoudnessMeterRpc);
  }

  process(inputs: Float32Array[][]): boolean {
    if (this.isDisposed()) {
      return false;
    }
    const input = inputs[0] ?? [];
    this.meter.process(input.length === 0 ? this.silence : input);
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, LoudnessMeterProcessor);
