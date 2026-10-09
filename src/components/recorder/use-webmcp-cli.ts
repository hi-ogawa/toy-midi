import { connectWebMcpCli } from "@hiogawa/webmcp-cli/client";
import { useEffect } from "react";
import type { RecorderRuntime } from "../../lib/recorder/runtime";
import { createWebMcpTools } from "../../lib/webmcp-tools";

const DEFAULT_BRIDGE_PORT = "4747";

/**
 * Connects the open project's WebMCP tools to the local webmcp-cli bridge when the
 * page URL has `?webmcp-cli` or `?webmcp-cli=<port>`.
 */
export function useWebMcpCli(runtime: RecorderRuntime) {
  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    if (!params.has("webmcp-cli")) {
      return;
    }
    const port = params.get("webmcp-cli") || DEFAULT_BRIDGE_PORT;
    return connectWebMcpCli({
      bridgeUrl: `http://localhost:${port}`,
      tools: createWebMcpTools(runtime),
    });
  }, [runtime]);
}
