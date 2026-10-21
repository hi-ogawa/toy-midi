import ampWorkletUrl from "./amp-worklet.ts?worker&url";
import type { AmpParameters } from "./amp.ts";
import { disposeWorklet } from "./worklet-disposal.ts";

const PROCESSOR_NAME = "amp";
const registrations = new WeakMap<BaseAudioContext, Promise<void>>();

class AmpWorkletNode extends AudioWorkletNode {
  constructor({
    context,
    channelCount,
    parameters,
  }: {
    context: BaseAudioContext;
    channelCount: number;
    parameters: AmpParameters;
  }) {
    super(context, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount,
      channelCountMode: "explicit",
      outputChannelCount: [channelCount],
      processorOptions: { parameters },
    });
  }

  setParameters(parameters: AmpParameters): void {
    this.port.postMessage(parameters);
  }

  dispose(): void {
    disposeWorklet(this);
  }
}

/** A track's amp, or a direct connection while the track has none. */
export class AmpNode {
  readonly input: GainNode;
  readonly output: GainNode;
  private worklet?: AmpWorkletNode;

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
    if (parameters && this.worklet) {
      this.worklet.setParameters(parameters);
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
    this.worklet = new AmpWorkletNode({
      context: this.input.context,
      channelCount: 2,
      parameters,
    });
    this.input.connect(this.worklet).connect(this.output);
  }

  private disconnect(): void {
    this.input.disconnect();
    this.worklet?.dispose();
    this.worklet = undefined;
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
