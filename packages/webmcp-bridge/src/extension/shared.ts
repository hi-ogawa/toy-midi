import type { BridgeStatus } from "../client.ts";

/**
 * The messages the content script and the relay script post in the page, with
 * a bridge request or its result as JSON text. They go through `postMessage`
 * because an object in a custom event's `detail` does not cross from the
 * page's world to the extension's.
 */
export interface PageMessage {
  type: "webmcp-bridge:request" | "webmcp-bridge:result";
  data: string;
}

/**
 * The message the relay script sends the background worker when it starts, to
 * learn whether its tab is exposed. The reply is the bridge URL to expose the
 * tab to, or nothing.
 */
export interface ResumeMessage {
  type: "webmcp-bridge:resume";
}

/**
 * The message the background worker sends the relay script, with the bridge
 * URL to expose the tab to, or without one to stop.
 */
export interface ExposeMessage {
  type: "webmcp-bridge:expose";
  bridgeUrl?: string;
}

/**
 * The message the offscreen document sends the background worker as a tab's
 * connection changes.
 */
export interface StatusMessage {
  type: "webmcp-bridge:status";
  tabId: number;
  status: BridgeStatus;
}
