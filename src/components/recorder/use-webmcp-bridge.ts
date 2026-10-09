import { connectWebMcpBridge } from "@hiogawa/webmcp-bridge/client";
import { useEffect } from "react";
import type { RecorderRuntime } from "../../lib/recorder/runtime";
import { createWebMcpTools } from "../../lib/webmcp-tools";

const DEFAULT_BRIDGE_PORT = "4747";

/**
 * Connects the open project's WebMCP tools to the local webmcp-bridge when the
 * page URL has `?webmcp-bridge` or `?webmcp-bridge=<port>`.
 */
export function useWebMcpBridge(runtime: RecorderRuntime) {
  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    if (!params.has("webmcp-bridge")) {
      return;
    }
    const port = params.get("webmcp-bridge") || DEFAULT_BRIDGE_PORT;
    return connectWebMcpBridge({
      bridgeUrl: `http://localhost:${port}`,
      tools: createWebMcpTools(runtime),
    });
  }, [runtime]);
}
