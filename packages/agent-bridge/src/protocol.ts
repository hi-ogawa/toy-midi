// The bridge's contract between the server in cli.ts, the page client in
// client.ts, and the CLI commands: the endpoints, the methods a page serves,
// and the data they carry. The RPC messages that carry calls are generic and
// live in rpc.ts. Internal to this package, so the `./client` entry does not
// export them.

import type { AgentToolResult } from "./client.ts";
import type { RpcRequest } from "./rpc.ts";

/**
 * Endpoints pages request. `GET connect?url=<page href>` streams
 * `PageEvents`, and `POST result` takes an `RpcResponse`.
 */
export const PAGE_ENDPOINTS = {
  connect: "/connect",
  result: "/result",
} as const;

/**
 * Endpoints the CLI requests. `POST rpc?page=<id>` takes an `RpcCall` and
 * forwards it to the page as is, so the bridge needs no endpoint per method.
 */
export const AGENT_ENDPOINTS = {
  rpc: "/rpc",
  pages: "/pages",
} as const;

// Page side: the bridge calls `PageRpc` methods on a page over the
// `PAGE_ENDPOINTS`.

/**
 * Methods a page serves to the bridge, named after WebMCP's `ModelContext`.
 * `executeTool` takes the tool by name, because a WebMCP `RegisteredTool`
 * holds a `window` that cannot be sent, and resolves to the result object
 * rather than its JSON string.
 */
export interface PageRpc {
  getTools(): ToolInfo[];
  executeTool(tool: { name: string }, input: unknown): Promise<AgentToolResult>;
}

/** Names of the Server-Sent Events the bridge streams to a page. */
export const PAGE_EVENTS = {
  hello: "hello",
  request: "request",
} as const;

/** Each page event's data, by event name. */
export interface PageEvents {
  [PAGE_EVENTS.hello]: { pageId: string };
  [PAGE_EVENTS.request]: RpcRequest;
}

/** The fields of a WebMCP `RegisteredTool` that the agent needs. */
export interface ToolInfo {
  name: string;
  description: string;
  inputSchema: object;
}

/** An entry of the `GET /pages` response. */
export interface PageInfo {
  id: string;
  origin: string;
  url?: string;
  connectedAt: string;
}
