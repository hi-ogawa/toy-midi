import type { RpcRequest } from "./rpc.ts";
import type { RegisteredTool, WebMcpToolResult } from "./webmcp.ts";

/**
 * WebMCP's `ModelContext` as the bridge calls it on a page. A
 * `RegisteredTool` holds a `window`, which cannot be sent, so `executeTool`
 * takes the tool by name.
 */
export interface PageRpc {
  getTools(): Promise<ToolInfo[]>;
  executeTool(
    tool: { name: string },
    input: unknown,
  ): Promise<WebMcpToolResult>;
}

export type ToolInfo = Pick<
  RegisteredTool,
  "name" | "description" | "inputSchema"
>;

export const DEFAULT_BRIDGE_PORT = 4747;

export const PAGE_PREFIX = "/page/";

/**
 * `GET connect?url=<page href>` streams `PageEvents`, and `POST result` takes
 * an `RpcResponse`.
 */
export const PAGE_ENDPOINTS = {
  connect: `${PAGE_PREFIX}connect`,
  result: `${PAGE_PREFIX}result`,
} as const;

export const PAGE_EVENTS = {
  request: "request",
} as const;

export interface PageEvents {
  [PAGE_EVENTS.request]: RpcRequest;
}

export const AGENT_PREFIX = "/agent/";

/**
 * `POST rpc?page=<id>` takes an `RpcCall` and forwards it to the page as is,
 * so the bridge needs no endpoint per method. `GET pages` returns `PageInfo[]`.
 */
export const AGENT_ENDPOINTS = {
  rpc: `${AGENT_PREFIX}rpc`,
  pages: `${AGENT_PREFIX}pages`,
} as const;

export interface PageInfo {
  id: string;
  origin: string;
  url?: string;
  connectedAt: string;
}
