// Generic RPC message types, independent of what the bridge calls. A caller
// sends an `RpcCall`, and the callee answers with an `RpcResult`. Transports
// that send the two as separate messages pair them by `requestId`.

/** A method call, with arguments that must be JSON-serializable. */
export interface RpcCall {
  method: string;
  args: unknown[];
}

/** The outcome of a call, with an error message if the callee failed. */
export type RpcResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export type RpcRequest = RpcCall & { requestId: string };

export type RpcResponse = RpcResult & { requestId: string };
