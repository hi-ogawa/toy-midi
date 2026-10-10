import { useEffect } from "react";
import type { RecorderRuntime } from "../../lib/recorder/runtime";
import { createWebMcpTools } from "../../lib/webmcp-tools";

/**
 * Registers the open project's WebMCP tools with `document.modelContext`,
 * which the browser has with WebMCP or with the webmcp-bridge extension.
 */
export function useWebMcpTools(runtime: RecorderRuntime) {
  useEffect(() => {
    const { modelContext } = document;
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
