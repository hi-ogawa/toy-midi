import { connectWebMcpBridge } from "@hiogawa/webmcp-bridge/client";
import { useEffect } from "react";
import type { RecorderRuntime } from "../../lib/recorder/runtime";
import { createWebMcpTools } from "../../lib/webmcp-tools";

const DEFAULT_BRIDGE_PORT = "4747";

/**
 * Exposes the open project's WebMCP tools. With `?webmcp-bridge` or
 * `?webmcp-bridge=<port>` in the page URL, the page connects to the local
 * webmcp-bridge itself. Otherwise it registers them with
 * `document.modelContext`, which the browser has with WebMCP or with the
 * webmcp-bridge extension.
 */
export function useWebMcpBridge(runtime: RecorderRuntime) {
  useEffect(() => {
    const tools = createWebMcpTools(runtime);
    const params = new URL(window.location.href).searchParams;
    if (params.has("webmcp-bridge")) {
      const port = params.get("webmcp-bridge") || DEFAULT_BRIDGE_PORT;
      return connectWebMcpBridge({
        bridgeUrl: `http://localhost:${port}`,
        tools: new Map(tools.map((tool) => [tool.name, tool])),
      });
    }
    const { modelContext } = document;
    if (!modelContext) {
      return;
    }
    const controller = new AbortController();
    for (const tool of tools) {
      void modelContext.registerTool(tool, { signal: controller.signal });
    }
    return () => controller.abort();
  }, [runtime]);
}
