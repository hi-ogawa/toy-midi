import type { RpcClient } from "./core.ts";
import { createEndpointRpc, registerEndpointRpcHandlers } from "./endpoint.ts";

export function createWorkerRpc<Handlers>(worker: Worker): RpcClient<Handlers> {
  return createEndpointRpc<Handlers>(worker);
}

export function registerWorkerRpcHandlers(handlers: object): void {
  registerEndpointRpcHandlers(self, handlers);
}
