import { exposeModelContext } from "@hiogawa/webmcp-bridge/client";
import { createModelContext } from "@hiogawa/webmcp-bridge/model-context";
import { useEffect } from "react";
import type { RecorderRuntime } from "../../lib/recorder/runtime";
import { createWebMcpTools } from "../../lib/webmcp-tools";

const DEFAULT_BRIDGE_PORT = "4747";

/**
 * Registers the open project's WebMCP tools with `document.modelContext`,
 * installing a polyfill in browsers without WebMCP, so the webmcp-bridge
 * extension can expose them. With `?webmcp-bridge` or `?webmcp-bridge=<port>`
 * in the page URL, the page also exposes them to the local webmcp-bridge
 * itself.
 */
export function useWebMcpBridge(runtime: RecorderRuntime) {
  useEffect(() => {
    const modelContext = (document.modelContext ??= createModelContext());
    const controller = new AbortController();
    for (const tool of createWebMcpTools(runtime)) {
      void modelContext.registerTool(tool, { signal: controller.signal });
    }
    const params = new URL(window.location.href).searchParams;
    const unexpose = params.has("webmcp-bridge")
      ? exposeModelContext({
          bridgeUrl: `http://localhost:${params.get("webmcp-bridge") || DEFAULT_BRIDGE_PORT}`,
          modelContext,
        })
      : undefined;
    return () => {
      controller.abort();
      unexpose?.();
    };
  }, [runtime]);
}
