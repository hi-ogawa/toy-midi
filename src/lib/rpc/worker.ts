import type { RpcClient } from "./core.ts";
import { createRpcProxy, deserializeParams, serializeParams } from "./core.ts";

const RPC_REQUEST = "rpc-request";
const RPC_RESPONSE = "rpc-response";
const RPC_CALLBACK = "rpc-callback";

interface RpcRequest {
  type: typeof RPC_REQUEST;
  id: string;
  method: string;
  params: unknown;
}

interface RpcResponse {
  type: typeof RPC_RESPONSE;
  id: string;
  result?: unknown;
  error?: string;
}

interface RpcCallbackInvoke {
  type: typeof RPC_CALLBACK;
  requestId: string;
  callbackId: string;
  args: unknown[];
}

interface RpcEndpoint {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<any>) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<any>) => void,
  ): void;
  postMessage(message: any, transfer?: any): void;
}

export function createWorkerRpc<Handlers>(worker: Worker): RpcClient<Handlers> {
  return createEndpointRpc<Handlers>(worker);
}

export function registerWorkerRpcHandlers(handlers: object): void {
  registerEndpointRpcHandlers(self, handlers);
}

export function createMessagePortRpc<Handlers>(
  port: MessagePort,
): RpcClient<Handlers> {
  port.start();
  return createEndpointRpc<Handlers>(port);
}

function createEndpointRpc<Handlers>(
  endpoint: RpcEndpoint,
): RpcClient<Handlers> {
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
        endpoint.removeEventListener("message", handleMessage);
      };
      const handleMessage = (
        event: MessageEvent<RpcResponse | RpcCallbackInvoke>,
      ) => {
        const message = event.data;
        if (message.type === RPC_CALLBACK && message.requestId === id) {
          callbacks.get(message.callbackId)?.(...message.args);
          return;
        }
        if (message.type === RPC_RESPONSE && message.id === id) {
          cleanup();
          if (message.error) {
            reject(new Error(message.error));
          } else {
            resolve(message.result);
          }
        }
      };
      endpoint.addEventListener("message", handleMessage);
      endpoint.postMessage(
        {
          type: RPC_REQUEST,
          id,
          method,
          params: serializedParams,
        } satisfies RpcRequest,
        collectTransferables(serializedParams),
      );
    });
  });
}

export function registerEndpointRpcHandlers(
  endpoint: RpcEndpoint,
  handlers: object,
): void {
  endpoint.addEventListener(
    "message",
    async (event: MessageEvent<RpcRequest>) => {
      if (event.data?.type !== RPC_REQUEST) {
        return;
      }
      const { id, method, params } = event.data;
      const handler = Reflect.get(handlers, method) as unknown;
      if (typeof handler !== "function") {
        endpoint.postMessage({
          type: RPC_RESPONSE,
          id,
          error: `Unknown method: ${method}`,
        } satisfies RpcResponse);
        return;
      }
      const deserializedParams = deserializeParams(
        params,
        (callbackId, args) => {
          endpoint.postMessage({
            type: RPC_CALLBACK,
            requestId: id,
            callbackId,
            args,
          } satisfies RpcCallbackInvoke);
        },
      );
      try {
        const result = await Reflect.apply(handler, handlers, [
          deserializedParams,
        ]);
        endpoint.postMessage(
          { type: RPC_RESPONSE, id, result } satisfies RpcResponse,
          collectTransferables(result),
        );
      } catch (error) {
        endpoint.postMessage({
          type: RPC_RESPONSE,
          id,
          error: error instanceof Error ? error.message : String(error),
        } satisfies RpcResponse);
      }
    },
  );
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
