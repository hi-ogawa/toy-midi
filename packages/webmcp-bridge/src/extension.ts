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

// Set by the build, 4747 by default as in the CLI.
declare const __WEBMCP_BRIDGE_PORT__: string;
const BRIDGE_URL = `http://localhost:${__WEBMCP_BRIDGE_PORT__}`;

const tools = new Map<string, WebMcpTool>();
let disconnect: (() => void) | undefined;

const modelContext = document.modelContext ?? installModelContext();
const registerTool = modelContext.registerTool.bind(modelContext);
modelContext.registerTool = async (tool, options) => {
  await registerTool(tool, options);
  addTool(tool, options?.signal);
};

// Stands in for `document.modelContext` in browsers without WebMCP. It only
// checks the name, and `modelContext.registerTool` above records the tool.
function installModelContext(): ModelContext {
  const polyfill: ModelContext = {
    registerTool: async (tool) => {
      if (tools.has(tool.name)) {
        throw new DOMException(
          `tool already registered: ${tool.name}`,
          "InvalidStateError",
        );
      }
    },
  };
  Object.defineProperty(document, "modelContext", { value: polyfill });
  return polyfill;
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
  if (tools.get(tool.name) !== tool) {
    return;
  }
  tools.delete(tool.name);
  if (tools.size === 0) {
    disconnect?.();
    disconnect = undefined;
  }
}
