import { exposeModelContext } from "@hiogawa/webmcp-bridge/client";
import { createModelContextPolyfill } from "@hiogawa/webmcp-bridge/model-context-polyfill";
import { useEffect } from "react";
import type { RecorderRuntime } from "../../lib/recorder/runtime";
import { createWebMcpTools } from "../../lib/webmcp-tools";

const DEFAULT_BRIDGE_PORT = "4747";

/**
 * Registers the open project's WebMCP tools with `document.modelContext`,
 * installing a polyfill in browsers without WebMCP. With `?webmcp-bridge` or
 * `?webmcp-bridge=<port>` in the page URL, the page also exposes them to the
 * local webmcp-bridge.
 */
export function useWebMcpBridge(runtime: RecorderRuntime) {
  useEffect(() => {
    const modelContext = (document.modelContext ??=
      createModelContextPolyfill());
    const controller = new AbortController();
    for (const tool of createWebMcpTools(runtime)) {
      void modelContext.registerTool(tool, { signal: controller.signal });
    }
    const params = new URL(window.location.href).searchParams;
    let dispose: (() => void) | undefined;
    if (params.has("webmcp-bridge")) {
      const port = params.get("webmcp-bridge") || DEFAULT_BRIDGE_PORT;
      dispose = exposeModelContext({
        bridgeUrl: `http://localhost:${port}`,
        modelContext,
      });
    }
    return () => {
      controller.abort();
      dispose?.();
    };
  }, [runtime]);
}
