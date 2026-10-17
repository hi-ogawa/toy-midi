import type { Capture, CaptureWorkletNotification } from "./capture-worklet.ts";
import captureWorkletUrl from "./capture-worklet.ts?worker&url";
import { disposeWorklet } from "./dsp/worklet-disposal.ts";
import type { RpcClient } from "./rpc/core.ts";
import { createRpcClient } from "./rpc/endpoint.ts";

const PROCESSOR_NAME = "recorder-capture";
const registrations = new WeakMap<AudioContext, Promise<void>>();

export class CaptureWorkletNode {
  readonly node: AudioWorkletNode;
  private readonly capture: RpcClient<Capture>;
  private readonly pendingActiveChanges = new Set<(error: Error) => void>();

  constructor({
    context,
    onNotification,
  }: {
    context: AudioContext;
    onNotification: (message: CaptureWorkletNotification) => void;
  }) {
    this.node = new AudioWorkletNode(context, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.node.port.onmessage = (
      event: MessageEvent<CaptureWorkletNotification | { type?: unknown }>,
    ) => {
      // RPC replies share the port.
      if (isCaptureNotification(event.data)) {
        onNotification(event.data);
      }
    };
    this.capture = createRpcClient<Capture>(this.node.port);
  }

  setChannel(value: number) {
    void this.capture.setChannel(value);
  }

  start() {
    return this.setActive(true);
  }

  stop() {
    return this.setActive(false);
  }

  dispose() {
    const error = new Error(
      "Input stopped during an audio capture transition.",
    );
    for (const reject of this.pendingActiveChanges) {
      reject(error);
    }
    this.pendingActiveChanges.clear();
    disposeWorklet(this.node);
  }

  private async setActive(value: boolean): Promise<number> {
    // A disposed worklet never replies, so dispose and the timeout end the wait.
    const stopped = Promise.withResolvers<never>();
    this.pendingActiveChanges.add(stopped.reject);
    const timeout = window.setTimeout(() => {
      stopped.reject(new Error("Audio capture state change timed out."));
    }, 3_000);
    try {
      return await Promise.race([
        this.capture.setActive(value),
        stopped.promise,
      ]);
    } finally {
      window.clearTimeout(timeout);
      this.pendingActiveChanges.delete(stopped.reject);
    }
  }
}

function isCaptureNotification(
  message: CaptureWorkletNotification | { type?: unknown },
): message is CaptureWorkletNotification {
  return message.type === "channels" || message.type === "samples";
}

export async function ensureCaptureWorklet(
  context: AudioContext,
): Promise<void> {
  // Worklet registration belongs to an AudioContext. Share concurrent attempts,
  // but discard failures so a later input-open attempt can retry.
  let registration = registrations.get(context);
  if (!registration) {
    registration = context.audioWorklet.addModule(captureWorkletUrl);
    registrations.set(context, registration);
  }
  try {
    await registration;
  } catch (error) {
    registrations.delete(context);
    throw error;
  }
}
