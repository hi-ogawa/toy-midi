import { createRpcClient } from "../rpc/endpoint.ts";
import type { LoudnessMeterRpc } from "./loudness-meter-worklet.ts";
import loudnessMeterWorkletUrl from "./loudness-meter-worklet.ts?worker&url";
import type { LoudnessMeasurement } from "./loudness.ts";
import { disposeWorklet } from "./worklet-disposal.ts";

const PROCESSOR_NAME = "loudness-meter";
const registrations = new WeakMap<BaseAudioContext, Promise<void>>();

/** Measures a stereo signal connected to it, without an output of its own. */
export class LoudnessMeterWorkletNode extends AudioWorkletNode {
  private readonly meter = createRpcClient<LoudnessMeterRpc>(this.port);

  constructor(context: BaseAudioContext) {
    super(context, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 2,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
    });
  }

  measure(): Promise<LoudnessMeasurement> {
    return this.meter.measure();
  }

  dispose(): void {
    disposeWorklet(this);
  }
}

export async function ensureLoudnessMeterWorklet(
  context: BaseAudioContext,
): Promise<void> {
  let registration = registrations.get(context);
  if (!registration) {
    registration = context.audioWorklet.addModule(loudnessMeterWorkletUrl);
    registrations.set(context, registration);
  }
  try {
    await registration;
  } catch (error) {
    registrations.delete(context);
    throw error;
  }
}
