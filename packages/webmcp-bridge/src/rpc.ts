/** A method call, with arguments that must be JSON-serializable. */
export interface RpcCall {
  method: string;
  args: unknown[];
}

export type RpcResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export type RpcRequest = RpcCall & { requestId: string };

export type RpcResponse = RpcResult & { requestId: string };
