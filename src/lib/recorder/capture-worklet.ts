const CAPTURE_PROCESSOR_NAME = "recorder-capture";
const INITIAL_CHANNEL_TIMEOUT = 3_000;

type ClientMessage =
  | { type: "channel"; value: number }
  | { type: "active"; requestId: number; value: boolean };

export type CaptureChunk = {
  /** Absolute AudioContext frame corresponding to `samples[0]`. */
  frameStart: number;
  samples: Float32Array;
};

export type CaptureWorkletNotification =
  | { type: "channels"; value: number }
  | { type: "level"; peak: number }
  | ({ type: "samples" } & CaptureChunk);

type WorkletMessage =
  | CaptureWorkletNotification
  | {
      type: "activeChanged";
      requestId: number;
      value: boolean;
      frame: number;
    };

export class CaptureWorkletClient {
  readonly node: AudioWorkletNode;
  readonly ready: Promise<{ channelCount: number }>;
  private nextRequestId = 0;
  private readyState = Promise.withResolvers<{ channelCount: number }>();
  private readySettled = false;
  private readyTimeout: number;
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
    this.ready = this.readyState.promise;
    this.readyTimeout = window.setTimeout(() => {
      this.readySettled = true;
      this.readyState.reject(
        new Error("Audio input channel detection timed out."),
      );
    }, INITIAL_CHANNEL_TIMEOUT);
    this.node = new AudioWorkletNode(context, CAPTURE_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.node.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      if (event.data.type !== "activeChanged") {
        if (
          event.data.type === "channels" &&
          event.data.value > 0 &&
          !this.readySettled
        ) {
          this.readySettled = true;
          window.clearTimeout(this.readyTimeout);
          this.readyState.resolve({ channelCount: event.data.value });
        }
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
    if (!this.readySettled) {
      this.readySettled = true;
      window.clearTimeout(this.readyTimeout);
      this.readyState.reject(
        new Error("Input stopped before channel detection."),
      );
    }
    for (const pending of this.pendingActiveChanges.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingActiveChanges.clear();
    this.node.disconnect();
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
    declare recording: boolean;
    declare selectedChannel: number;
    declare observedChannelCount: number;
    declare meterBlockCount: number;
    declare meterPeak: number;
    declare pendingRenderActions: Array<() => void>;
    declare captureBuffer: Float32Array;
    declare captureLength: number;
    declare captureStartFrame: number;

    constructor() {
      super();
      this.recording = false;
      this.selectedChannel = 0;
      this.observedChannelCount = -1;
      this.meterBlockCount = 0;
      this.meterPeak = 0;
      this.pendingRenderActions = [];
      this.captureBuffer = new Float32Array(4096);
      this.captureLength = 0;
      this.captureStartFrame = 0;
      this.port.onmessage = (event: MessageEvent<ClientMessage>) => {
        switch (event.data.type) {
          case "channel": {
            this.selectedChannel = event.data.value;
            this.meterBlockCount = 0;
            this.meterPeak = 0;
            break;
          }
          case "active": {
            const { requestId, value } = event.data;
            // Queue transitions until process() so capture state, buffered PCM,
            // and acknowledgement frames share render-thread ordering.
            this.pendingRenderActions.push(() => {
              if (value) {
                this.captureLength = 0;
              } else {
                this.flushCapture();
              }
              this.recording = value;
              this.postMessage({
                type: "activeChanged",
                requestId,
                value,
                frame: currentFrame,
              });
            });
            break;
          }
        }
      };
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][]) {
      for (const action of this.pendingRenderActions) {
        action();
      }
      this.pendingRenderActions = [];
      const channels = inputs[0] ?? [];
      // The output keeps this processor in the render graph, but input audio
      // must never pass through to speakers.
      for (const samples of outputs[0] ?? []) {
        samples.fill(0);
      }
      if (channels.length !== this.observedChannelCount) {
        // Track settings may be absent or disagree with actual render quanta.
        this.observedChannelCount = channels.length;
        this.postMessage({ type: "channels", value: channels.length });
      }
      if (channels.length > 0) {
        // Clamp against the observed graph so a transient channel-count change
        // still produces capture from an available channel.
        const source =
          channels[Math.min(this.selectedChannel, channels.length - 1)];
        for (const sample of source) {
          this.meterPeak = Math.max(this.meterPeak, Math.abs(sample));
        }
        this.meterBlockCount++;
        if (this.meterBlockCount >= 16) {
          // Aggregate render quanta to avoid flooding the main thread with meter
          // updates while retaining a responsive peak display.
          this.postMessage({ type: "level", peak: this.meterPeak });
          this.meterBlockCount = 0;
          this.meterPeak = 0;
        }
        if (this.recording) {
          this.appendCapture(source);
        }
      } else if (this.recording && this.captureLength > 0) {
        // Flush before a gap so no chunk claims frame-contiguous PCM across
        // missing input. Take assembly leaves the absent interval as silence.
        this.flushCapture();
      }
      return true;
    }

    appendCapture(source: Float32Array) {
      let sourceOffset = 0;
      while (sourceOffset < source.length) {
        if (this.captureLength === 0) {
          // currentFrame identifies this render quantum. sourceOffset preserves
          // the absolute frame when one quantum spans two transfer batches.
          this.captureStartFrame = currentFrame + sourceOffset;
        }
        const count = Math.min(
          source.length - sourceOffset,
          this.captureBuffer.length - this.captureLength,
        );
        this.captureBuffer.set(
          source.subarray(sourceOffset, sourceOffset + count),
          this.captureLength,
        );
        this.captureLength += count;
        sourceOffset += count;
        if (this.captureLength === this.captureBuffer.length) {
          this.flushCapture();
        }
      }
    }

    flushCapture() {
      if (this.captureLength === 0) {
        return;
      }
      // Copy only the populated prefix because the staging buffer is reused,
      // then transfer ownership of that copy to the main thread.
      const samples = this.captureBuffer.slice(0, this.captureLength);
      this.postMessage(
        {
          type: "samples",
          frameStart: this.captureStartFrame,
          samples,
        },
        [samples.buffer],
      );
      this.captureLength = 0;
    }

    postMessage(message: WorkletMessage, transfer?: Transferable[]) {
      this.port.postMessage(message, transfer ?? []);
    }
  };
}
