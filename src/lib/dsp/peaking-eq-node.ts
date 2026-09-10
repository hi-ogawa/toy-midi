import type { EqParameters } from "./eq.ts";
import peakingEqWorkletUrl from "./peaking-eq-worklet.ts?worker&url";

const PROCESSOR_NAME = "peaking-eq";
const registrations = new WeakMap<BaseAudioContext, Promise<void>>();

export const EQ_LIMITS = {
  frequency: { min: 20, max: 20000, step: 1 },
  gainDb: { min: -18, max: 18, step: 0.1 },
  q: { min: 0.1, max: 18, step: 0.1 },
};

export function createDefaultPeakingEq(): EqParameters {
  return { frequency: 1000, gain: 1, q: 1, bypass: false };
}

export class PeakingEqNode extends AudioWorkletNode {
  constructor({
    context,
    channelCount,
    parameters,
  }: {
    context: BaseAudioContext;
    channelCount: number;
    parameters: EqParameters;
  }) {
    super(context, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount,
      channelCountMode: "explicit",
      outputChannelCount: [channelCount],
      processorOptions: { channelCount, parameters },
    });
  }

  setParameters(parameters: Partial<EqParameters>): void {
    this.port.postMessage(parameters);
  }
}

export async function ensurePeakingEqWorklet(
  context: BaseAudioContext,
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
