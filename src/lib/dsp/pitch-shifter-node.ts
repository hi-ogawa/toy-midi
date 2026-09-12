import pitchShifterWorkletUrl from "./pitch-shifter-worklet.ts?worker&url";

const PROCESSOR_NAME = "pitch-shifter";
const registrations = new WeakMap<AudioContext, Promise<void>>();

export type PitchShifterCommand =
  | { type: "setPitchRatio"; pitchRatio: number }
  | { type: "reset" };

export class PitchShifterNode extends AudioWorkletNode {
  constructor({
    context,
    channelCount,
    pitchRatio,
  }: {
    context: AudioContext;
    channelCount: number;
    pitchRatio: number;
  }) {
    super(context, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount,
      channelCountMode: "explicit",
      outputChannelCount: [channelCount],
      processorOptions: { channelCount, pitchRatio },
    });
  }

  /** Sets the ratio and clears buffered audio, including when the ratio is unchanged. */
  setPitchRatio(pitchRatio: number): void {
    this.port.postMessage({
      type: "setPitchRatio",
      pitchRatio,
    } satisfies PitchShifterCommand);
  }

  /** Clears buffered audio while retaining the current ratio. */
  reset(): void {
    this.port.postMessage({ type: "reset" } satisfies PitchShifterCommand);
  }
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
