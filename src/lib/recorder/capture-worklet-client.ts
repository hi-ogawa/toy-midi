import type { RpcClient } from "../rpc/core.ts";
import { createMessagePortRpc } from "../rpc/message-port.ts";

export const CAPTURE_PROCESSOR_NAME = "recorder-capture";

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
    return await this.rpc.detectChannels({});
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
