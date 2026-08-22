import type { RpcClient } from "../rpc/core.ts";
import { createMessagePortRpc } from "../rpc/worker.ts";
import type {
  CaptureProcessor,
  CaptureWorkletNotification,
} from "./capture-worklet.ts";

export const CAPTURE_PROCESSOR_NAME = "recorder-capture";

export class CaptureWorkletClient {
  readonly node: AudioWorkletNode;
  private readonly rpc: RpcClient<CaptureProcessor>;

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
    this.rpc = createMessagePortRpc<CaptureProcessor>(this.node.port);
  }

  async getChannelCount() {
    return await this.rpc.getChannelCount({});
  }

  setChannel(value: number) {
    return this.rpc.setChannel({ value });
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
