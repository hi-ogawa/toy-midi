const CAPTURE_PROCESSOR_NAME = "latency-capture";

type ClientMessage =
  | { type: "active"; requestId: number; value: boolean }
  | { type: "channel"; value: number };

type WorkletMessage =
  | { type: "activeChanged"; requestId: number; value: boolean }
  | { type: "channels"; value: number }
  | ({ type: "samples" } & CaptureChunk);

export type CaptureChunk = {
  /** Absolute AudioContext frame corresponding to `samples[0]`. */
  frameStart: number;
  samples: Float32Array;
};

export class CaptureWorkletClient {
  readonly node: AudioWorkletNode;
  active = false;

  private nextRequestId = 0;
  private pendingActiveChanges = new Map<
    number,
    {
      reject: (error: Error) => void;
      resolve: () => void;
      timeout: number;
    }
  >();

  constructor({
    context,
    onNotification,
  }: {
    context: AudioContext;
    onNotification: (message: WorkletMessage) => void;
  }) {
    this.node = new AudioWorkletNode(context, CAPTURE_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.node.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      if (event.data.type !== "activeChanged") {
        onNotification(event.data);
        return;
      }
      const pending = this.pendingActiveChanges.get(event.data.requestId);
      if (!pending) {
        return;
      }
      window.clearTimeout(pending.timeout);
      this.active = event.data.value;
      pending.resolve();
      this.pendingActiveChanges.delete(event.data.requestId);
    };
  }

  setActive(value: boolean) {
    const requestId = this.nextRequestId++;
    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pendingActiveChanges.delete(requestId);
        reject(new Error("The audio capture state change timed out."));
      }, 3_000);
      this.pendingActiveChanges.set(requestId, { reject, resolve, timeout });
      this.postMessage({ type: "active", requestId, value });
    });
  }

  setChannel(value: number) {
    this.postMessage({ type: "channel", value });
  }

  dispose() {
    const error = new Error(
      "Input monitoring stopped during a capture state change.",
    );
    for (const pending of this.pendingActiveChanges.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingActiveChanges.clear();
    this.node.disconnect();
  }

  private postMessage(message: ClientMessage) {
    this.node.port.postMessage(message);
  }
}

export function createCaptureWorkletSource() {
  // The processor has no module imports once stringified, so the generated blob
  // can be registered without a separate worklet build entry point.
  return `
    const CaptureProcessor = (${createCaptureProcessor.toString()})();
    registerProcessor("${CAPTURE_PROCESSOR_NAME}", CaptureProcessor);
  `;
}

// These globals exist only inside AudioWorkletGlobalScope. Declarations let the
// processor stay type-checked before its source is stringified for that scope.
declare const AudioWorkletProcessor: new () => { port: MessagePort };
declare const currentFrame: number;

function createCaptureProcessor() {
  return class CaptureProcessor extends AudioWorkletProcessor {
    declare active: boolean;
    declare channel: number;
    declare lastChannelCount: number;
    declare pendingRenderActions: Array<() => void>;

    constructor() {
      super();
      this.active = false;
      this.channel = 0;
      this.lastChannelCount = -1;
      this.pendingRenderActions = [];
      this.port.onmessage = (event: MessageEvent<ClientMessage>) => {
        if (event.data.type === "active") {
          const { requestId, value } = event.data;
          // Construct the protocol action here so process() only owns when the
          // state transition becomes visible to the audio thread.
          this.pendingRenderActions.push(() => {
            this.active = value;
            this.postMessage({ type: "activeChanged", requestId, value });
          });
        }
        if (event.data.type === "channel") {
          this.channel = event.data.value;
        }
      };
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][]) {
      for (const action of this.pendingRenderActions) {
        action();
      }
      this.pendingRenderActions = [];
      const channels = inputs[0] || [];
      const output = outputs[0] || [];
      if (channels.length !== this.lastChannelCount) {
        // Browser track settings can be incomplete, so report the channel count
        // observed in actual render quanta.
        this.lastChannelCount = channels.length;
        this.postMessage({ type: "channels", value: channels.length });
      }
      const selected = channels[this.channel];
      if (selected) {
        output[0]?.set(selected);

        if (this.active) {
          // TODO: Batch multiple render quanta before transferring. The input
          // buffer is browser-owned, and transferred buffers detach, so direct
          // transfer or simple preallocation cannot safely avoid this copy.
          const copy = new Float32Array(selected);
          this.postMessage(
            {
              type: "samples",
              // currentFrame is the absolute frame of this render quantum and
              // lets the main thread preserve gaps and align scheduled clicks.
              frameStart: currentFrame,
              samples: copy,
            },
            [copy.buffer],
          );
        }
      }
      if (!selected) {
        output[0]?.fill(0);
      }
      return true;
    }

    postMessage(message: WorkletMessage, transfer?: Transferable[]) {
      this.port.postMessage(message, transfer ?? []);
    }
  };
}
