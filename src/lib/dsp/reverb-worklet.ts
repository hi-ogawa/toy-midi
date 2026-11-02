import { Reverb, REVERB_PARAMETERS } from "./reverb.ts";
import { watchWorkletDisposal } from "./worklet-disposal.ts";

const PROCESSOR_NAME = "reverb";
// The Web Audio render quantum.
const BLOCK_FRAMES = 128;

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

class ReverbProcessor extends AudioWorkletProcessor {
  private readonly isDisposed = watchWorkletDisposal(this.port);
  private readonly reverb = new Reverb({
    sampleRate,
    blockFrames: BLOCK_FRAMES,
    parameters: REVERB_PARAMETERS,
  });
  private readonly silence = [new Float32Array(BLOCK_FRAMES)];

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.isDisposed()) {
      return false;
    }
    const output = outputs[0] ?? [];
    if (output.length === 0) {
      return true;
    }
    // The input has no channels once every send has gone quiet, and the tail
    // still has to ring out.
    const input = inputs[0]?.length ? inputs[0] : this.silence;
    this.reverb.process(input, output);
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, ReverbProcessor);
