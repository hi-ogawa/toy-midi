import reverbWorkletUrl from "./reverb-worklet.ts?worker&url";
import { disposeWorklet } from "./worklet-disposal.ts";

const PROCESSOR_NAME = "reverb";
const registrations = new WeakMap<BaseAudioContext, Promise<void>>();

/** The shared reverb, which sums every send into its mono input. */
export class ReverbNode {
  readonly input: GainNode;
  private readonly output: AudioNode;
  private worklet?: AudioWorkletNode;

  constructor({
    context,
    output,
  }: {
    context: BaseAudioContext;
    output: AudioNode;
  }) {
    this.input = context.createGain();
    this.output = output;
  }

  async init(): Promise<void> {
    await ensureReverbWorklet(this.input.context);
    this.worklet = new AudioWorkletNode(this.input.context, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: "explicit",
      outputChannelCount: [2],
    });
    this.input.connect(this.worklet).connect(this.output);
  }

  dispose(): void {
    this.input.disconnect();
    if (this.worklet) {
      disposeWorklet(this.worklet);
    }
  }
}

async function ensureReverbWorklet(context: BaseAudioContext): Promise<void> {
  let registration = registrations.get(context);
  if (!registration) {
    registration = context.audioWorklet.addModule(reverbWorkletUrl);
    registrations.set(context, registration);
  }
  try {
    await registration;
  } catch (error) {
    registrations.delete(context);
    throw error;
  }
}
