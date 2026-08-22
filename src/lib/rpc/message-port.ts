import { createRpcProxy } from "./core.ts";

const RPC_REQUEST = "rpc-request";
const RPC_RESPONSE = "rpc-response";

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

export function createMessagePortRpc<Handlers>(port: MessagePort) {
  const pending = new Map<
    string,
    {
      reject: (error: Error) => void;
      resolve: (result: unknown) => void;
    }
  >();
  port.addEventListener("message", (event: MessageEvent<RpcResponse>) => {
    if (event.data?.type !== RPC_RESPONSE) {
      return;
    }
    const request = pending.get(event.data.id);
    if (!request) {
      return;
    }
    pending.delete(event.data.id);
    if (event.data.error) {
      request.reject(new Error(event.data.error));
    } else {
      request.resolve(event.data.result);
    }
  });
  port.start();

  const client = createRpcProxy<Handlers>((method, params) => {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      pending.set(id, { reject, resolve });
      port.postMessage({
        type: RPC_REQUEST,
        id,
        method,
        params,
      } satisfies RpcRequest);
    });
  });

  return {
    client,
    dispose(error: Error): void {
      for (const request of pending.values()) {
        request.reject(error);
      }
      pending.clear();
    },
  };
}

export function registerMessagePortRpcHandlers(
  port: MessagePort,
  handlers: object,
): void {
  port.addEventListener("message", async (event: MessageEvent<RpcRequest>) => {
    if (event.data?.type !== RPC_REQUEST) {
      return;
    }
    const { id, method, params } = event.data;
    const handler = Reflect.get(handlers, method) as unknown;
    if (typeof handler !== "function") {
      port.postMessage({
        type: RPC_RESPONSE,
        id,
        error: `Unknown method: ${method}`,
      } satisfies RpcResponse);
      return;
    }
    try {
      const result = await Reflect.apply(handler, handlers, [params]);
      port.postMessage({
        type: RPC_RESPONSE,
        id,
        result,
      } satisfies RpcResponse);
    } catch (error) {
      port.postMessage({
        type: RPC_RESPONSE,
        id,
        error: error instanceof Error ? error.message : String(error),
      } satisfies RpcResponse);
    }
  });
  port.start();
}
