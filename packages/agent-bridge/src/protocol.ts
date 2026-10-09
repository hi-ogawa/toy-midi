// JSON messages between the bridge server in cli.ts, the page client in
// client.ts, and the CLI commands that talk to the server. Internal to this
// package, so the `./client` entry does not export them.

import type { AgentToolResult } from "./client.ts";

/**
 * Endpoints pages request. `GET connect?url=<page href>` streams
 * `PageEvents`, and `POST result` takes a `PageResult`.
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

/** Server-Sent Events the bridge streams to a page, by event name. */
export interface PageEvents {
  hello: { pageId: string };
  request: PageRequest;
}

/** A `PageRpc` method call, as the CLI posts it and the page receives it. */
export interface RpcCall {
  method: keyof PageRpc;
  args: unknown[];
}

export type PageRequest = RpcCall & { requestId: string };

/** The `POST /result` body. */
export type PageResult = BridgeResult & { requestId: string };

/** The outcome of a call, as the page posts it and the bridge returns it. */
export type BridgeResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

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
