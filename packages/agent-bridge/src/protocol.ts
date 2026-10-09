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
 * Endpoints the CLI requests, named after the `PageRpc` methods they call.
 * `getTools` and `executeTool` take `?page=<id>` to choose the page.
 */
export const AGENT_ENDPOINTS = {
  getTools: "/get-tools",
  executeTool: "/execute-tool",
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

/** A `PageRpc` method's result, as the page posts it and the bridge returns it. */
export type PageRpcResult<K extends keyof PageRpc> = BridgeResult<
  Awaited<ReturnType<PageRpc[K]>>
>;

/** Server-Sent Events the bridge streams to a page, by event name. */
export interface PageEvents {
  hello: { pageId: string };
  request: PageRequest;
}

export interface PageRequest {
  requestId: string;
  method: keyof PageRpc;
  args: unknown[];
}

/** The `POST /result` body. */
export type PageResult = BridgeResult & { requestId: string };

// Agent side: the CLI commands' requests and responses.

/** The outcome of a request, as the page posts it and the bridge returns it. */
export type BridgeResult<T = unknown> =
  | { ok: true; value?: T }
  | { ok: false; error: string };

/** The `GET /get-tools` response. */
export type GetToolsResponse = PageRpcResult<"getTools">;

/** The fields of a WebMCP `RegisteredTool` that the agent needs. */
export interface ToolInfo {
  name: string;
  description: string;
  inputSchema: object;
}

/** The `POST /execute-tool` body and response. */
export interface ExecuteToolRequest {
  name: string;
  input: unknown;
}

export type ExecuteToolResponse = PageRpcResult<"executeTool">;

/** An entry of the `GET /pages` response. */
export interface PageInfo {
  id: string;
  origin: string;
  url?: string;
  connectedAt: string;
}
