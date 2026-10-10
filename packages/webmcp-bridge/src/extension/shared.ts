import type { BridgeStatus } from "../client.ts";

/**
 * The event the background worker dispatches in a page, with the bridge URL to
 * expose the page to, or without one to stop.
 */
export const EXPOSE_EVENT = "webmcp-bridge:expose";

/**
 * The message the content script posts in the page for the relay script to
 * forward to the background worker. It goes through `postMessage` because an
 * object in a custom event's `detail` does not cross from the page's world to
 * the extension's.
 */
export interface StatusMessage {
  type: "webmcp-bridge:status";
  status: BridgeStatus;
}
