import { registerEndpointRpcHandlers } from "../rpc/worker.ts";
import {
  CAPTURE_PROCESSOR_NAME,
  type CaptureWorkletNotification,
} from "./capture-worklet-client.ts";

declare const AudioWorkletProcessor: new () => { port: MessagePort };
declare const currentFrame: number;
declare function registerProcessor(
  name: string,
  processor: typeof AudioWorkletProcessor,
): void;

export class CaptureProcessor extends AudioWorkletProcessor {
  private recording = false;
  private selectedChannel = 0;
  private observedChannelCount = -1;
  private pendingChannelRequests: Array<(value: number) => void> = [];
  private meterBlockCount = 0;
  private meterPeak = 0;
  private pendingRenderActions: Array<() => void> = [];
  private captureBuffer = new Float32Array(4096);
  private captureLength = 0;
  private captureStartFrame = 0;

  constructor() {
    super();
    registerEndpointRpcHandlers(this.port, this);
  }

  async getChannelCount(_params: Record<string, never>): Promise<number> {
    if (this.observedChannelCount > 0) {
      return this.observedChannelCount;
    }
    return await new Promise<number>((resolve) => {
      this.pendingChannelRequests.push(resolve);
    });
  }

  async setChannel({ value }: { value: number }): Promise<void> {
    this.selectedChannel = value;
    this.meterBlockCount = 0;
    this.meterPeak = 0;
  }

  async setActive({ value }: { value: boolean }): Promise<number> {
    // Resolving schedules the RPC response through a microtask on the render
    // thread. Keep this pattern to infrequent control transitions; validate
    // AudioWorklet scheduling before using it for per-quantum work.
    return await new Promise<number>((resolve) => {
      // Queue transitions until process() so capture state and buffered PCM
      // share render-thread ordering with the returned frame.
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
      // Clamp against the observed graph so an unavailable selected channel
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

  private appendCapture(source: Float32Array) {
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

  private flushCapture() {
    if (this.captureLength === 0) {
      return;
    }
    // Copy only the populated prefix because the staging buffer is reused,
    // then transfer ownership of that copy to the main thread.
    const samples = this.captureBuffer.slice(0, this.captureLength);
    this.postMessage(
      { type: "samples", frameStart: this.captureStartFrame, samples },
      [samples.buffer],
    );
    this.captureLength = 0;
  }

  private postMessage(
    message: CaptureWorkletNotification,
    transfer?: Transferable[],
  ) {
    this.port.postMessage(message, transfer ?? []);
  }
}

registerProcessor(CAPTURE_PROCESSOR_NAME, CaptureProcessor);
