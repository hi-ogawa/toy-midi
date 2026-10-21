import ampWorkletUrl from "./amp-worklet.ts?worker&url";
import type { AmpParameters } from "./amp.ts";
import { disposeWorklet } from "./worklet-disposal.ts";

const PROCESSOR_NAME = "amp";
const registrations = new WeakMap<BaseAudioContext, Promise<void>>();

/**
 * The amp between fixed input and output nodes. Without parameters it connects
 * them directly, so a dry track has no amp delay.
 */
export class AmpWorkletNode {
  readonly input: GainNode;
  readonly output: GainNode;
  private node?: AudioWorkletNode;

  constructor({
    context,
    parameters,
  }: {
    context: BaseAudioContext;
    parameters?: AmpParameters;
  }) {
    this.input = context.createGain();
    this.output = context.createGain();
    this.connect(parameters);
  }

  setParameters(parameters: AmpParameters | undefined): void {
    if (parameters && this.node) {
      this.node.port.postMessage(parameters);
      return;
    }
    this.disconnect();
    this.connect(parameters);
  }

  dispose(): void {
    this.disconnect();
    this.output.disconnect();
  }

  private connect(parameters: AmpParameters | undefined): void {
    if (!parameters) {
      this.input.connect(this.output);
      return;
    }
    this.node = new AudioWorkletNode(this.input.context, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: "explicit",
      outputChannelCount: [2],
      processorOptions: { parameters },
    });
    this.input.connect(this.node).connect(this.output);
  }

  private disconnect(): void {
    this.input.disconnect();
    if (this.node) {
      disposeWorklet(this.node);
      this.node = undefined;
    }
  }
}

export async function ensureAmpWorklet(
  context: BaseAudioContext,
): Promise<void> {
  let registration = registrations.get(context);
  if (!registration) {
    registration = context.audioWorklet.addModule(ampWorkletUrl);
    registrations.set(context, registration);
  }
  try {
    await registration;
  } catch (error) {
    registrations.delete(context);
    throw error;
  }
}
