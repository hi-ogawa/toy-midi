import { describe, expect, it, vi } from "vitest";
import { createWorkerRpc } from "./worker.ts";

interface TestHandlers {
  analyze(params: {
    pcm: Float32Array;
    onProgress: (percent: number) => void;
  }): Promise<string>;
}

class FakeWorker extends EventTarget {
  posted: { message: any; transfer: Transferable[] }[] = [];

  postMessage(message: any, transfer: Transferable[]): void {
    this.posted.push({ message, transfer });
  }
}

describe("createWorkerRpc", () => {
  it("calls a typed worker method and forwards callbacks", async () => {
    const worker = new FakeWorker();
    const rpc = createWorkerRpc<TestHandlers>(worker as unknown as Worker);
    const onProgress = vi.fn();
    const pcm = new Float32Array([0.25]);

    const result = rpc.analyze({ pcm, onProgress });
    const [{ message, transfer }] = worker.posted;
    const callbackId = message.params.onProgress.__rpcCallback;

    expect(message.method).toBe("analyze");
    expect(message.params.pcm).toBe(pcm);
    expect(transfer).toEqual([pcm.buffer]);

    worker.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "worker-rpc-callback",
          requestId: message.id,
          callbackId,
          args: [0.5],
        },
      }),
    );
    worker.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "worker-rpc-response",
          id: message.id,
          result: "done",
        },
      }),
    );

    expect(onProgress).toHaveBeenCalledWith(0.5);
    await expect(result).resolves.toBe("done");
  });

  it("rejects errors returned by the worker", async () => {
    const worker = new FakeWorker();
    const rpc = createWorkerRpc<TestHandlers>(worker as unknown as Worker);

    const result = rpc.analyze({
      pcm: new Float32Array(),
      onProgress: () => {},
    });
    const [{ message }] = worker.posted;
    worker.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "worker-rpc-response",
          id: message.id,
          error: "analysis failed",
        },
      }),
    );

    await expect(result).rejects.toThrow("analysis failed");
  });

  it("rejects worker failures", async () => {
    const worker = new FakeWorker();
    const rpc = createWorkerRpc<TestHandlers>(worker as unknown as Worker);

    const result = rpc.analyze({
      pcm: new Float32Array(),
      onProgress: () => {},
    });
    const event = new Event("error") as ErrorEvent;
    Object.defineProperty(event, "message", { value: "worker failed" });
    worker.dispatchEvent(event);

    await expect(result).rejects.toThrow("worker failed");
  });
});
