// The extension's content script. It runs in the page's main world before the
// page's own scripts, so it sees every tool the page registers with
// `document.modelContext`, and relays them to the local bridge while at least
// one is registered.
//
// It keeps its own record of the registered tools and calls their `execute`
// directly, rather than going through a native `getTools()` and
// `executeTool()`, so it works the same with native WebMCP and without it.

import { connectWebMcpBridge } from "./client.ts";
import type { ModelContext, WebMcpTool } from "./webmcp.ts";

// Set by the build.
declare const __WEBMCP_BRIDGE_PORT__: string;
const BRIDGE_URL = `http://localhost:${__WEBMCP_BRIDGE_PORT__}`;

const tools = new Map<string, WebMcpTool>();
let disconnect: (() => void) | undefined;

if (document.modelContext) {
  recordNativeTools(document.modelContext);
} else {
  installModelContext();
}

// Records each tool once the browser has accepted it, so a name the browser
// rejects as a duplicate is never recorded.
function recordNativeTools(modelContext: ModelContext) {
  const registerTool = modelContext.registerTool.bind(modelContext);
  modelContext.registerTool = async (tool, options) => {
    await registerTool(tool, options);
    addTool(tool, options?.signal);
  };
}

// Stands in for `document.modelContext` in browsers without WebMCP. It checks
// the name and records the tool in one step, so a second registration of the
// name is rejected even before the first one resolves.
function installModelContext() {
  const polyfill: ModelContext = {
    registerTool: async (tool, options) => {
      if (tools.has(tool.name)) {
        throw new DOMException(
          `tool already registered: ${tool.name}`,
          "InvalidStateError",
        );
      }
      addTool(tool, options?.signal);
    },
  };
  Object.defineProperty(document, "modelContext", { value: polyfill });
}

function addTool(tool: WebMcpTool, signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    return;
  }
  tools.set(tool.name, tool);
  signal?.addEventListener("abort", () => removeTool(tool), { once: true });
  disconnect ??= connectWebMcpBridge({ bridgeUrl: BRIDGE_URL, tools });
}

function removeTool(tool: WebMcpTool) {
  tools.delete(tool.name);
  if (tools.size === 0) {
    disconnect?.();
    disconnect = undefined;
  }
}
