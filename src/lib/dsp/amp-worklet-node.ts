import ampWorkletUrl from "./amp-worklet.ts?worker&url";
import type { AmpParameters } from "./amp.ts";
import { disposeWorklet } from "./worklet-disposal.ts";

const PROCESSOR_NAME = "amp";
const registrations = new WeakMap<BaseAudioContext, Promise<void>>();

export class AmpWorkletNode extends AudioWorkletNode {
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
