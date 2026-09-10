import type { EqParameters } from "./eq.ts";
import peakingEqWorkletUrl from "./peaking-eq-worklet.ts?worker&url";

const PROCESSOR_NAME = "peaking-eq";
const registrations = new WeakMap<AudioContext, Promise<void>>();

export function createPeakingEqNode({
  context,
  channelCount,
  parameters,
}: {
  context: AudioContext;
  channelCount: number;
  parameters: EqParameters;
}): AudioWorkletNode {
  return new AudioWorkletNode(context, PROCESSOR_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount,
    channelCountMode: "explicit",
    outputChannelCount: [channelCount],
    processorOptions: { channelCount, parameters },
  });
}

export function setPeakingEqNodeParameters(
  node: AudioWorkletNode,
  parameters: Partial<EqParameters>,
): void {
  node.port.postMessage(parameters);
}

export async function ensurePeakingEqWorklet(
  context: AudioContext,
): Promise<void> {
  let registration = registrations.get(context);
  if (!registration) {
    registration = context.audioWorklet.addModule(peakingEqWorkletUrl);
    registrations.set(context, registration);
  }
  try {
    await registration;
  } catch (error) {
    registrations.delete(context);
    throw error;
  }
}
