import type { RpcClient } from "./core.ts";
import { createRpcProxy, deserializeParams, serializeParams } from "./core.ts";

const WORKER_RPC_REQUEST = "worker-rpc-request";
const WORKER_RPC_RESPONSE = "worker-rpc-response";
const WORKER_RPC_CALLBACK = "worker-rpc-callback";

interface RpcRequest {
  type: typeof WORKER_RPC_REQUEST;
  id: string;
  method: string;
  params: unknown;
}

interface RpcResponse {
  type: typeof WORKER_RPC_RESPONSE;
  id: string;
  result?: unknown;
  error?: string;
}

interface RpcCallbackInvoke {
  type: typeof WORKER_RPC_CALLBACK;
  requestId: string;
  callbackId: string;
  args: unknown[];
}

export function createWorkerRpc<Handlers>(worker: Worker): RpcClient<Handlers> {
  return createRpcProxy<Handlers>((method, params) => {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const callbacks = new Map<string, (...args: unknown[]) => void>();
      const serializedParams = serializeParams(
        params,
        (callbackId, callback) => {
          callbacks.set(callbackId, callback);
        },
      );
      const cleanup = () => {
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
        worker.removeEventListener("messageerror", handleMessageError);
      };
      const handleMessage = (
        event: MessageEvent<RpcResponse | RpcCallbackInvoke>,
      ) => {
        const message = event.data;
        if (message.type === WORKER_RPC_CALLBACK && message.requestId === id) {
          callbacks.get(message.callbackId)?.(...message.args);
          return;
        }
        if (message.type === WORKER_RPC_RESPONSE && message.id === id) {
          cleanup();
          if (message.error) {
            reject(new Error(message.error));
          } else {
            resolve(message.result);
          }
        }
      };
      const handleError = (event: ErrorEvent) => {
        cleanup();
        reject(new Error(event.message || "Worker failed"));
      };
      const handleMessageError = () => {
        cleanup();
        reject(new Error("Worker message could not be read"));
      };
      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);
      worker.addEventListener("messageerror", handleMessageError);
      worker.postMessage(
        {
          type: WORKER_RPC_REQUEST,
          id,
          method,
          params: serializedParams,
        } satisfies RpcRequest,
        collectTransferables(serializedParams),
      );
    });
  });
}

export function registerWorkerRpcHandlers(handlers: object): void {
  self.addEventListener("message", async (event: MessageEvent<RpcRequest>) => {
    if (event.data?.type !== WORKER_RPC_REQUEST) {
      return;
    }

    const { id, method, params } = event.data;
    const handler = Reflect.get(handlers, method) as unknown;
    if (typeof handler !== "function") {
      self.postMessage({
        type: WORKER_RPC_RESPONSE,
        id,
        error: `Unknown method: ${method}`,
      } satisfies RpcResponse);
      return;
    }

    const deserializedParams = deserializeParams(params, (callbackId, args) => {
      self.postMessage({
        type: WORKER_RPC_CALLBACK,
        requestId: id,
        callbackId,
        args,
      } satisfies RpcCallbackInvoke);
    });

    try {
      const result = await Reflect.apply(handler, handlers, [
        deserializedParams,
      ]);
      self.postMessage(
        {
          type: WORKER_RPC_RESPONSE,
          id,
          result,
        } satisfies RpcResponse,
        { transfer: collectTransferables(result) },
      );
    } catch (error) {
      self.postMessage({
        type: WORKER_RPC_RESPONSE,
        id,
        error: error instanceof Error ? error.message : String(error),
      } satisfies RpcResponse);
    }
  });
}

function collectTransferables(value: unknown): Transferable[] {
  const transferables: Transferable[] = [];
  const seen = new WeakSet<object>();

  function visit(current: unknown): void {
    if (current instanceof ArrayBuffer) {
      if (!transferables.includes(current)) {
        transferables.push(current);
      }
      return;
    }
    if (ArrayBuffer.isView(current) && current.buffer instanceof ArrayBuffer) {
      if (!transferables.includes(current.buffer)) {
        transferables.push(current.buffer);
      }
      return;
    }
    if (current === null || typeof current !== "object" || seen.has(current)) {
      return;
    }
    seen.add(current);
    for (const nested of Object.values(current)) {
      visit(nested);
    }
  }

  visit(value);
  return transferables;
}
