import pitchShifterWorkletUrl from "./pitch-shifter-worklet.ts?worker&url";

const PROCESSOR_NAME = "pitch-shifter";
const registrations = new WeakMap<AudioContext, Promise<void>>();

export function createPitchShifterNode({
  context,
  channelCount,
  pitchRatio,
}: {
  context: AudioContext;
  channelCount: number;
  pitchRatio: number;
}): AudioWorkletNode {
  return new AudioWorkletNode(context, PROCESSOR_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount,
    channelCountMode: "explicit",
    outputChannelCount: [channelCount],
    processorOptions: { channelCount, pitchRatio },
  });
}

export async function ensurePitchShifterWorklet(
  context: AudioContext,
): Promise<void> {
  let registration = registrations.get(context);
  if (!registration) {
    registration = context.audioWorklet.addModule(pitchShifterWorkletUrl);
    registrations.set(context, registration);
  }
  try {
    await registration;
  } catch (error) {
    registrations.delete(context);
    throw error;
  }
}
