// The extension's content script. It runs in the page's main world before the
// page's own scripts, so every tool the page registers with
// `document.modelContext` is relayed to the local bridge.

import { createBridgeModelContext } from "./client.ts";

// Set by the build.
declare const __WEBMCP_BRIDGE_PORT__: string;

const bridgeModelContext = createBridgeModelContext({
  bridgeUrl: `http://localhost:${__WEBMCP_BRIDGE_PORT__}`,
});
const nativeModelContext = document.modelContext;

if (nativeModelContext) {
  // Keep the browser's own `modelContext`, and relay each tool once the
  // browser has accepted it, so a name it rejects is never relayed.
  const registerTool = nativeModelContext.registerTool.bind(nativeModelContext);
  nativeModelContext.registerTool = async (tool, options) => {
    await registerTool(tool, options);
    await bridgeModelContext.registerTool(tool, options);
  };
} else {
  Object.defineProperty(document, "modelContext", {
    value: bridgeModelContext,
  });
}
