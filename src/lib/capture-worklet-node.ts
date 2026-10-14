import type {
  CaptureClientMessage,
  CaptureWorkletMessage,
  CaptureWorkletNotification,
} from "./capture-worklet.ts";
import captureWorkletUrl from "./capture-worklet.ts?worker&url";
import { disposeWorklet } from "./dsp/worklet-disposal.ts";

const PROCESSOR_NAME = "recorder-capture";
const registrations = new WeakMap<AudioContext, Promise<void>>();

export class CaptureWorkletNode {
  readonly node: AudioWorkletNode;
  private nextRequestId = 0;
  private pendingActiveChanges = new Map<
    number,
    {
      reject: (error: Error) => void;
      resolve: (frameStart: number) => void;
      timeout: number;
    }
  >();

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
    this.node.port.onmessage = (event: MessageEvent<CaptureWorkletMessage>) => {
      if (event.data.type !== "activeChanged") {
        onNotification(event.data);
        return;
      }
      const pending = this.pendingActiveChanges.get(event.data.requestId);
      if (!pending) {
        return;
      }
      window.clearTimeout(pending.timeout);
      pending.resolve(event.data.frame);
      this.pendingActiveChanges.delete(event.data.requestId);
    };
  }

  setChannel(value: number) {
    this.postMessage({ type: "channel", value });
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
    for (const pending of this.pendingActiveChanges.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingActiveChanges.clear();
    disposeWorklet(this.node);
  }

  private setActive(value: boolean) {
    const requestId = this.nextRequestId++;
    // Resolve only after the render thread applies this transition. Request IDs
    // prevent delayed acknowledgements from satisfying a newer transition.
    return new Promise<number>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pendingActiveChanges.delete(requestId);
        reject(new Error("Audio capture state change timed out."));
      }, 3_000);
      this.pendingActiveChanges.set(requestId, { reject, resolve, timeout });
      this.postMessage({ type: "active", requestId, value });
    });
  }

  private postMessage(message: CaptureClientMessage) {
    this.node.port.postMessage(message);
  }
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
