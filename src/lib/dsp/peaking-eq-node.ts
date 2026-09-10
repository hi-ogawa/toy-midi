import { clamp } from "../music.ts";
import { type EqParameters, PeakingEq } from "./eq.ts";
import peakingEqWorkletUrl from "./peaking-eq-worklet.ts?worker&url";

const PROCESSOR_NAME = "peaking-eq";
const registrations = new WeakMap<AudioContext, Promise<void>>();

export const EQ_LIMITS = {
  frequency: { min: 20, max: 20000, step: 1 },
  gainDb: { min: -18, max: 18, step: 0.5 },
  q: { min: 0.1, max: 18, step: 0.1 },
};

export function createDefaultPeakingEq(): EqParameters {
  return { frequency: 1000, gain: 1, q: 1, bypass: false };
}

export function normalizePeakingEq(eq: EqParameters): EqParameters {
  const defaults = createDefaultPeakingEq();
  return {
    frequency: Number.isFinite(eq.frequency)
      ? clamp(eq.frequency, EQ_LIMITS.frequency.min, EQ_LIMITS.frequency.max)
      : defaults.frequency,
    gain: Number.isFinite(eq.gain)
      ? clamp(
          eq.gain,
          dbToGain(EQ_LIMITS.gainDb.min),
          dbToGain(EQ_LIMITS.gainDb.max),
        )
      : defaults.gain,
    q: Number.isFinite(eq.q)
      ? clamp(eq.q, EQ_LIMITS.q.min, EQ_LIMITS.q.max)
      : defaults.q,
    bypass: eq.bypass,
  };
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

export function gainToDb(gain: number): number {
  return 20 * Math.log10(gain);
}

export class PeakingEqNode extends AudioWorkletNode {
  constructor({
    context,
    channelCount,
    parameters,
  }: {
    context: AudioContext;
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
  eq: EqParameters;
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
    ...eq,
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
