import { watchWorkletDisposal } from "./dsp/worklet-disposal.ts";
import { registerRpcHandlers } from "./rpc/endpoint.ts";

const PROCESSOR_NAME = "recorder-capture";

export type CaptureChunk = {
  /** Absolute AudioContext frame corresponding to `samples[0]`. */
  frameStart: number;
  samples: Float32Array;
};

export type CaptureWorkletNotification =
  | { type: "channels"; value: number }
  | ({ type: "samples" } & CaptureChunk);

declare const AudioWorkletProcessor: new (
  options?: AudioWorkletNodeOptions,
) => {
  readonly port: MessagePort;
};
declare const currentFrame: number;
declare function registerProcessor(
  name: string,
  processorCtor: typeof AudioWorkletProcessor,
): void;

class CaptureProcessor extends AudioWorkletProcessor {
  private readonly isDisposed = watchWorkletDisposal(this.port);
  private readonly capture = new Capture(this.port);

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    registerRpcHandlers(this.port, this.capture);
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.isDisposed()) {
      return false;
    }
    this.capture.render(inputs[0] ?? [], outputs[0]?.[0]);
    return true;
  }
}

/** Capture state, with its async methods called from the main thread. */
export class Capture {
  private recording = false;
  private selectedChannel = 0;
  private observedChannelCount = -1;
  private pendingRenderActions: Array<() => void> = [];
  private readonly captureBuffer = new Float32Array(4096);
  private captureLength = 0;
  private captureStartFrame = 0;

  constructor(private readonly port: MessagePort) {}

  async setChannel(value: number): Promise<void> {
    this.selectedChannel = value;
  }

  /** Resolves with the frame at which the render thread applied the change. */
  async setActive(value: boolean): Promise<number> {
    // Resolving here sends the RPC reply from the render thread, so keep this
    // to infrequent control changes rather than anything per render quantum.
    return await new Promise<number>((resolve) => {
      // Queue transitions until render() so capture state, buffered PCM, and
      // the returned frame share render-thread ordering.
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

  render(channels: Float32Array[], output: Float32Array | undefined): void {
    for (const action of this.pendingRenderActions) {
      action();
    }
    this.pendingRenderActions = [];
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
      output?.set(source);
      if (this.recording) {
        this.appendCapture(source);
      }
    } else if (this.recording && this.captureLength > 0) {
      // Flush before a gap so no chunk claims frame-contiguous PCM across
      // missing input. Take assembly leaves the absent interval as silence.
      this.flushCapture();
    }
    if (channels.length === 0) {
      output?.fill(0);
    }
  }

  private appendCapture(source: Float32Array): void {
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

  private flushCapture(): void {
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

  private postMessage(
    message: CaptureWorkletNotification,
    transfer?: Transferable[],
  ): void {
    this.port.postMessage(message, transfer ?? []);
  }
}

registerProcessor(PROCESSOR_NAME, CaptureProcessor);
