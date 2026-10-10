// The extension's content script. It runs in the page's main world before the
// page's own scripts, and puts a `document.modelContext` in place that relays
// every tool the page registers to the local bridge.

import { createBridgeModelContext } from "./client.ts";

// Set by the build.
declare const __WEBMCP_BRIDGE_PORT__: string;

Object.defineProperty(document, "modelContext", {
  value: createBridgeModelContext({
    bridgeUrl: `http://localhost:${__WEBMCP_BRIDGE_PORT__}`,
    nativeModelContext: document.modelContext,
  }),
});
