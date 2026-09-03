const PROCESSOR_NAME = "pitch-shifter";
const registrations = new WeakMap<AudioContext, Promise<void>>();

export async function createPitchShifterNode({
  context,
  channelCount,
  pitchRatio,
}: {
  context: AudioContext;
  channelCount: number;
  pitchRatio: number;
}): Promise<AudioWorkletNode> {
  await ensurePitchShifterWorklet(context);
  return new AudioWorkletNode(context, PROCESSOR_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount,
    channelCountMode: "explicit",
    outputChannelCount: [channelCount],
    processorOptions: { channelCount, pitchRatio },
  });
}

async function ensurePitchShifterWorklet(context: AudioContext): Promise<void> {
  let registration = registrations.get(context);
  if (!registration) {
    registration = context.audioWorklet.addModule(
      new URL("./pitch-shifter-worklet.ts", import.meta.url),
    );
    registrations.set(context, registration);
  }
  try {
    await registration;
  } catch (error) {
    registrations.delete(context);
    throw error;
  }
}
