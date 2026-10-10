import { createBridgeModelContext } from "@hiogawa/webmcp-bridge/client";
import { useEffect } from "react";
import type { RecorderRuntime } from "../../lib/recorder/runtime";
import { createWebMcpTools } from "../../lib/webmcp-tools";

const DEFAULT_BRIDGE_PORT = "4747";

/**
 * Registers the open project's WebMCP tools with `document.modelContext`,
 * which the browser has with WebMCP or with the webmcp-bridge extension.
 */
export function useWebMcpBridge(runtime: RecorderRuntime) {
  useEffect(() => {
    const modelContext = document.modelContext ?? createFallbackModelContext();
    if (!modelContext) {
      return;
    }
    const controller = new AbortController();
    for (const tool of createWebMcpTools(runtime)) {
      void modelContext.registerTool(tool, { signal: controller.signal });
    }
    return () => controller.abort();
  }, [runtime]);
}

// Without either, a page URL with `?webmcp-bridge` or `?webmcp-bridge=<port>`
// relays the tools to the local webmcp-bridge, as the extension would.
function createFallbackModelContext() {
  const params = new URL(window.location.href).searchParams;
  if (!params.has("webmcp-bridge")) {
    return;
  }
  const port = params.get("webmcp-bridge") || DEFAULT_BRIDGE_PORT;
  return createBridgeModelContext({ bridgeUrl: `http://localhost:${port}` });
}
