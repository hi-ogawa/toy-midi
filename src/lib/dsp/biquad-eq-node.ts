import biquadEqWorkletUrl from "./biquad-eq-worklet.ts?worker&url";
import type { EqParameters } from "./biquad-eq.ts";

const PROCESSOR_NAME = "biquad-eq";
const registrations = new WeakMap<BaseAudioContext, Promise<void>>();

export function createDefaultEq(): EqParameters {
  // TODO: Use type-specific defaults so low-pass and high-pass start with a flat
  // passband at Q = 1 / Math.SQRT2 when selected, instead of inheriting Q = 1.
  return { type: "peaking", frequency: 1000, gain: 1, q: 1, bypass: false };
}

export class BiquadEqNode extends AudioWorkletNode {
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

export async function ensureBiquadEqWorklet(
  context: BaseAudioContext,
): Promise<void> {
  let registration = registrations.get(context);
  if (!registration) {
    registration = context.audioWorklet.addModule(biquadEqWorkletUrl);
    registrations.set(context, registration);
  }
  try {
    await registration;
  } catch (error) {
    registrations.delete(context);
    throw error;
  }
}
