const CAPTURE_PROCESSOR_NAME = "latency-capture";

type ToWorkletMessage =
  | { type: "active"; requestId: number; value: boolean }
  | { type: "channel"; value: number };

export type CaptureChunk = {
  /** Absolute AudioContext frame corresponding to `samples[0]`. */
  frameStart: number;
  samples: Float32Array;
};

type FromWorkletMessage =
  | { type: "activeChanged"; requestId: number; value: boolean }
  | { type: "channels"; value: number }
  | { type: "level"; peak: number }
  | ({ type: "samples" } & CaptureChunk);

export class CaptureWorkletClient {
  readonly node: AudioWorkletNode;
  active = false;

  #nextRequestId = 0;
  #pendingActiveChanges = new Map<
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
    onNotification: (message: FromWorkletMessage) => void;
  }) {
    this.node = new AudioWorkletNode(context, CAPTURE_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.node.port.onmessage = (event: MessageEvent<FromWorkletMessage>) => {
      if (event.data.type !== "activeChanged") {
        onNotification(event.data);
        return;
      }
      const pending = this.#pendingActiveChanges.get(event.data.requestId);
      if (!pending) {
        return;
      }
      window.clearTimeout(pending.timeout);
      this.active = event.data.value;
      pending.resolve();
      this.#pendingActiveChanges.delete(event.data.requestId);
    };
  }

  setActive(value: boolean) {
    const requestId = this.#nextRequestId++;
    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.#pendingActiveChanges.delete(requestId);
        reject(new Error("The audio capture state change timed out."));
      }, 3_000);
      this.#pendingActiveChanges.set(requestId, { reject, resolve, timeout });
      this.#postMessage({ type: "active", requestId, value });
    });
  }

  setChannel(value: number) {
    this.#postMessage({ type: "channel", value });
  }

  dispose() {
    const error = new Error(
      "Input monitoring stopped during a capture state change.",
    );
    for (const pending of this.#pendingActiveChanges.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.#pendingActiveChanges.clear();
    this.node.disconnect();
  }

  #postMessage(message: ToWorkletMessage) {
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
    declare meterBlockCount: number;
    declare meterPeak: number;
    declare pendingRenderActions: Array<() => void>;

    constructor() {
      super();
      this.active = false;
      this.channel = 0;
      this.lastChannelCount = -1;
      this.meterBlockCount = 0;
      this.meterPeak = 0;
      this.pendingRenderActions = [];
      this.port.onmessage = (event: MessageEvent<ToWorkletMessage>) => {
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
          // Do not mix meter history from the previously selected channel.
          this.meterBlockCount = 0;
          this.meterPeak = 0;
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
      // A connected output keeps the processor in the render graph, but capture
      // must never feed input audio back to speakers.
      for (const samples of output) {
        samples.fill(0);
      }
      if (channels.length !== this.lastChannelCount) {
        // Browser track settings can be incomplete, so report the channel count
        // observed in actual render quanta.
        this.lastChannelCount = channels.length;
        this.postMessage({ type: "channels", value: channels.length });
      }
      const selected = channels[this.channel];
      if (selected) {
        for (const sample of selected) {
          this.meterPeak = Math.max(this.meterPeak, Math.abs(sample));
        }
        this.meterBlockCount++;
        if (this.meterBlockCount >= 16) {
          // Aggregate render quanta to avoid flooding the main thread with UI
          // meter updates while retaining a responsive peak display.
          this.postMessage({ type: "level", peak: this.meterPeak });
          this.meterBlockCount = 0;
          this.meterPeak = 0;
        }

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
      return true;
    }

    postMessage(message: FromWorkletMessage, transfer?: Transferable[]) {
      // Keep the worklet-to-runtime protocol checked at every send site.
      this.port.postMessage(message, transfer ?? []);
    }
  };
}
