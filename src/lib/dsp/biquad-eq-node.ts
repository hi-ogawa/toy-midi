import type {
  MultibandEqBand,
  MultibandEqParameters,
} from "./biquad-eq-multiband.ts";
import biquadEqWorkletUrl from "./biquad-eq-worklet.ts?worker&url";
import { DEFAULT_PARAMETERS } from "./biquad-eq.ts";
import { disposeWorklet } from "./worklet-disposal.ts";

const PROCESSOR_NAME = "biquad-eq";
const registrations = new WeakMap<BaseAudioContext, Promise<void>>();

export function createDefaultEqBand(): MultibandEqBand {
  // TODO: Use type-specific defaults so low-pass and high-pass start with a flat
  // passband at Q = 1 / Math.SQRT2 when selected, instead of inheriting Q = 1.
  return {
    id: crypto.randomUUID(),
    ...DEFAULT_PARAMETERS,
  };
}

export function createDefaultMultibandEq(): MultibandEqParameters {
  return { bypass: false, bands: [createDefaultEqBand()] };
}

export class BiquadEqNode extends AudioWorkletNode {
  constructor({
    context,
    channelCount,
    parameters,
  }: {
    context: BaseAudioContext;
    channelCount: number;
    parameters: MultibandEqParameters;
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

  setParameters(parameters: MultibandEqParameters): void {
    this.port.postMessage(parameters);
  }

  dispose(): void {
    disposeWorklet(this);
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
