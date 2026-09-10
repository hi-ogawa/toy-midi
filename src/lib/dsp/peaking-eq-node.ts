import { clamp } from "../music.ts";
import { type EqParameters, PeakingEq } from "./eq.ts";
import peakingEqWorkletUrl from "./peaking-eq-worklet.ts?worker&url";

const PROCESSOR_NAME = "peaking-eq";
const registrations = new WeakMap<AudioContext, Promise<void>>();

export interface PeakingEqState {
  frequency: number;
  gain: number;
  q: number;
  bypassed: boolean;
}

export const EQ_LIMITS = {
  frequency: { min: 20, max: 20000, step: 1 },
  gain: { min: -18, max: 18, step: 0.5 },
  q: { min: 0.1, max: 18, step: 0.1 },
};

export function createDefaultPeakingEq(): PeakingEqState {
  return { frequency: 1000, gain: 0, q: 1, bypassed: false };
}

export function normalizePeakingEq(eq: PeakingEqState): PeakingEqState {
  const defaults = createDefaultPeakingEq();
  const normalize = (key: "frequency" | "gain" | "q") =>
    Number.isFinite(eq[key])
      ? clamp(eq[key], EQ_LIMITS[key].min, EQ_LIMITS[key].max)
      : defaults[key];
  return {
    frequency: normalize("frequency"),
    gain: normalize("gain"),
    q: normalize("q"),
    bypassed: eq.bypassed,
  };
}

export function createPeakingEqParameters(eq: PeakingEqState): EqParameters {
  return {
    frequency: eq.frequency,
    gain: 10 ** (eq.gain / 20),
    q: eq.q,
    bypass: eq.bypassed,
  };
}

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

export function processPeakingEqBuffer({
  context,
  buffer,
  eq,
  offset,
  duration,
}: {
  context: BaseAudioContext;
  buffer: AudioBuffer;
  eq: PeakingEqState;
  offset: number;
  duration: number;
}): AudioBuffer {
  const startFrame = Math.round(offset * buffer.sampleRate);
  const endFrame = Math.min(
    buffer.length,
    Math.round((offset + duration) * buffer.sampleRate),
  );
  const output = context.createBuffer(
    buffer.numberOfChannels,
    endFrame - startFrame,
    buffer.sampleRate,
  );
  const processor = new PeakingEq({
    sampleRate: buffer.sampleRate,
    channelCount: buffer.numberOfChannels,
    ...createPeakingEqParameters(eq),
  });
  processor.process({
    input: Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
      buffer.getChannelData(channel).subarray(startFrame, endFrame),
    ),
    output: Array.from({ length: output.numberOfChannels }, (_, channel) =>
      output.getChannelData(channel),
    ),
  });
  return output;
}
