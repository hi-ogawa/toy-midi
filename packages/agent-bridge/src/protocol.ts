// JSON messages between the bridge server in cli.ts, the page client in
// client.ts, and the CLI commands that talk to the server. Internal to this
// package, so the `./client` entry does not export them.

import type { AgentToolResult } from "./client.ts";

// Page side: `GET /connect` streams `PageEvents`, and the page answers each
// request with `POST /result`.

/** Server-Sent Events the bridge streams to a page, by event name. */
export interface PageEvents {
  hello: { pageId: string };
  request: PageRequest;
}

/** A request to list or call the page's tools, without its id. */
export type AgentBridgeRequest =
  | { method: "list" }
  | { method: "call"; name: string; input: unknown };

export type PageRequest = AgentBridgeRequest & { requestId: string };

/** The `POST /result` body. */
export type PageResult = BridgeResult & { requestId: string };

// Agent side: the CLI commands' requests and responses.

/** The outcome of a request, as the page posts it and the bridge returns it. */
export type BridgeResult<T = unknown> =
  | { ok: true; value?: T }
  | { ok: false; error: string };

/** The `GET /tools` response. */
export type ToolsResponse = BridgeResult<ToolInfo[]>;

export interface ToolInfo {
  name: string;
  description: string;
  inputSchema: object;
}

/** The `POST /call` body and response. */
export interface CallRequest {
  name: string;
  input: unknown;
}

export type CallResponse = BridgeResult<AgentToolResult>;

/** An entry of the `GET /pages` response. */
export interface PageInfo {
  id: string;
  origin: string;
  url?: string;
  connectedAt: string;
}
