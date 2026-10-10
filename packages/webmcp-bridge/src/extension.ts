// The extension's content script. It runs in the page's main world before the
// page's own scripts, installs the WebMCP polyfill where the browser has no
// `document.modelContext`, and exposes the page's tools to the local bridge.

import { exposeModelContext } from "./client.ts";
import { createModelContextPolyfill } from "./model-context-polyfill.ts";

// Set by the build.
declare const __WEBMCP_BRIDGE_PORT__: string;

exposeModelContext({
  bridgeUrl: `http://localhost:${__WEBMCP_BRIDGE_PORT__}`,
  modelContext: (document.modelContext ??= createModelContextPolyfill()),
});
