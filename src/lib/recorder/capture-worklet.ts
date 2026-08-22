import type { RpcClient } from "../rpc/core.ts";
import { deserializeParams } from "../rpc/core.ts";
import {
  collectTransferables,
  registerEndpointRpcHandlers,
} from "../rpc/endpoint.ts";
import { createMessagePortRpc } from "../rpc/message-port.ts";

const CAPTURE_PROCESSOR_NAME = "recorder-capture";

export type CaptureChunk = {
  /** Absolute AudioContext frame corresponding to `samples[0]`. */
  frameStart: number;
  samples: Float32Array;
};

export type CaptureWorkletNotification =
  | { type: "level"; peak: number }
  | ({ type: "samples" } & CaptureChunk);

interface CaptureWorkletHandlers {
  detectChannels(_params: Record<string, never>): Promise<number>;
  setActive(params: { value: boolean }): Promise<number>;
  setChannel(params: { value: number }): Promise<void>;
}

export class CaptureWorkletClient {
  readonly node: AudioWorkletNode;
  private readonly rpc: RpcClient<CaptureWorkletHandlers>;

  constructor({
    context,
    onNotification,
  }: {
    context: AudioContext;
    onNotification: (message: CaptureWorkletNotification) => void;
  }) {
    this.node = new AudioWorkletNode(context, CAPTURE_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.node.port.addEventListener(
      "message",
      (event: MessageEvent<CaptureWorkletNotification>) => {
        if (event.data.type === "level" || event.data.type === "samples") {
          onNotification(event.data);
        }
      },
    );
    this.rpc = createMessagePortRpc<CaptureWorkletHandlers>(this.node.port);
  }

  async detectChannels() {
    return { channelCount: await this.rpc.detectChannels({}) };
  }

  setChannel(value: number) {
    void this.rpc.setChannel({ value });
  }

  start() {
    return this.setActive(true);
  }

  stop() {
    return this.setActive(false);
  }

  dispose() {
    this.node.disconnect();
  }

  private async setActive(value: boolean) {
    return await this.rpc.setActive({ value });
  }
}

export function createCaptureWorkletSource() {
  // The processor has no module imports once stringified, so the generated blob
  // can be registered without a separate worklet build entry point.
  return `
    const deserializeParams = ${deserializeParams.toString()};
    const collectTransferables = ${collectTransferables.toString()};
    const registerEndpointRpcHandlers = ${registerEndpointRpcHandlers.toString()};
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
    declare pendingChannelRequests: Array<(value: number) => void>;
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
      this.pendingChannelRequests = [];
      this.meterBlockCount = 0;
      this.meterPeak = 0;
      this.pendingRenderActions = [];
      this.captureBuffer = new Float32Array(4096);
      this.captureLength = 0;
      this.captureStartFrame = 0;
      registerEndpointRpcHandlers(this.port, {
        detectChannels: async () => {
          if (this.observedChannelCount > 0) {
            return this.observedChannelCount;
          }
          return await new Promise<number>((resolve) => {
            this.pendingChannelRequests.push(resolve);
          });
        },
        setChannel: async ({ value }: { value: number }) => {
          this.selectedChannel = value;
          this.meterBlockCount = 0;
          this.meterPeak = 0;
        },
        setActive: async ({ value }: { value: boolean }) => {
          return await new Promise<number>((resolve) => {
            // Queue transitions until process() so capture state and buffered
            // PCM share render-thread ordering with the returned frame.
            this.pendingRenderActions.push(() => {
              if (value) {
                this.captureLength = 0;
              } else {
                this.flushCapture();
              }
              this.recording = value;
              resolve(currentFrame);
            });
          });
        },
      });
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
        if (channels.length > 0) {
          for (const resolve of this.pendingChannelRequests) {
            resolve(channels.length);
          }
          this.pendingChannelRequests = [];
        }
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

    postMessage(
      message: CaptureWorkletNotification,
      transfer?: Transferable[],
    ) {
      this.port.postMessage(message, transfer ?? []);
    }
  };
}
