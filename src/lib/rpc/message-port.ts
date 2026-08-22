import type { RpcClient } from "./core.ts";
import { createEndpointRpc } from "./endpoint.ts";

export function createMessagePortRpc<Handlers>(
  port: MessagePort,
): RpcClient<Handlers> {
  port.start();
  return createEndpointRpc<Handlers>(port);
}
