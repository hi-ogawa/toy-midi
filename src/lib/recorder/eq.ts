import { type EqParameters, PeakingEq } from "../dsp/eq.ts";
import { clamp } from "../music";

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
