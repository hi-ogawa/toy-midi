// Definitions shared by the server in server.ts, the page client in
// client.ts, and the CLI commands: the methods a page serves, the endpoints
// and events that carry them, and the data they return. The RPC messages that
// carry calls are generic and live in rpc.ts. Internal to this package, so the
// package entries do not export them.

import type { RpcRequest } from "./rpc.ts";
import type { RegisteredTool, WebMcpToolResult } from "./webmcp.ts";

/**
 * Methods a page serves to the bridge, named after WebMCP's `ModelContext`.
 * `executeTool` takes the tool by name, because a WebMCP `RegisteredTool`
 * holds a `window` that cannot be sent, and resolves to the result object
 * rather than its JSON string.
 */
export interface PageRpc {
  getTools(): Promise<ToolInfo[]>;
  executeTool(
    tool: { name: string },
    input: unknown,
  ): Promise<WebMcpToolResult>;
}

/**
 * The fields of a `RegisteredTool` that the agent reads, leaving out its
 * `window`, which cannot be sent as JSON.
 */
export type ToolInfo = Pick<
  RegisteredTool,
  "name" | "description" | "inputSchema"
>;

/** The port the bridge listens on, and the extension connects to, by default. */
export const DEFAULT_BRIDGE_PORT = 4747;

// Page side: the bridge calls `PageRpc` methods on a page over these
// endpoints and events.

/** Path prefix of every endpoint pages request. */
export const PAGE_PREFIX = "/page/";

/**
 * Endpoints pages request. `GET connect?url=<page href>` streams
 * `PageEvents`, and `POST result` takes an `RpcResponse`.
 */
export const PAGE_ENDPOINTS = {
  connect: `${PAGE_PREFIX}connect`,
  result: `${PAGE_PREFIX}result`,
} as const;

/** Names of the Server-Sent Events the bridge streams to a page. */
export const PAGE_EVENTS = {
  request: "request",
} as const;

/** Each page event's data, by event name. */
export interface PageEvents {
  [PAGE_EVENTS.request]: RpcRequest;
}

// Agent side: the CLI commands reach pages through these endpoints.

/** Path prefix of every endpoint the CLI requests. */
export const AGENT_PREFIX = "/agent/";

/**
 * Endpoints the CLI requests. `POST rpc?page=<id>` takes an `RpcCall` and
 * forwards it to the page as is, so the bridge needs no endpoint per method.
 * `GET pages` returns `PageInfo[]`.
 */
export const AGENT_ENDPOINTS = {
  rpc: `${AGENT_PREFIX}rpc`,
  pages: `${AGENT_PREFIX}pages`,
} as const;

/** A connected page, as `GET pages` lists it. */
export interface PageInfo {
  id: string;
  origin: string;
  url?: string;
  connectedAt: string;
}
