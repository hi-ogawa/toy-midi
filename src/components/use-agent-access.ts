import {
  DEFAULT_BRIDGE_PORT,
  exposeModelContext,
} from "@hiogawa/webmcp-bridge/client";
import { createModelContextPolyfill } from "@hiogawa/webmcp-bridge/model-context-polyfill";
import { useEffect } from "react";
import type { EditorRuntime } from "../lib/runtime";
import { toyMidiUtils } from "../lib/toy-midi-utils";
import { createWebMcpTools } from "../lib/webmcp-tools";

/**
 * Exposes the open project to agents in two ways. An agent that runs page
 * script reads `window.toyMidi`. Otherwise it calls the WebMCP tools, which
 * this registers with `document.modelContext`, installing a polyfill in
 * browsers without WebMCP, so the webmcp-bridge extension can expose them.
 * With `?webmcp-bridge` or `?webmcp-bridge=<port>` in the page URL, the page
 * also exposes them to the local webmcp-bridge itself.
 */
export function useAgentAccess(runtime: EditorRuntime) {
  useEffect(() => {
    window.toyMidi = { runtime, utils: toyMidiUtils };
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
      delete window.toyMidi;
      controller.abort();
      dispose?.();
    };
  }, [runtime]);
}
