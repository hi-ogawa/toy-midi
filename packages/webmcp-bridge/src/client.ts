import {
  PAGE_ENDPOINTS,
  PAGE_EVENTS,
  type PageEvents,
  type PageRpc,
} from "./protocol.ts";
import type { RpcResponse } from "./rpc.ts";
import type { ModelContext, WebMcpTool } from "./webmcp.ts";

/**
 * A `document.modelContext` that relays the tools registered with it to the
 * local bridge, connecting while at least one is registered. Given the
 * browser's own `modelContext`, it registers each tool there too, so agents
 * built into the browser see them as well.
 *
 * It keeps its own record of the tools and calls their `execute` directly,
 * rather than going through a native `getTools()` and `executeTool()`, so it
 * works the same with native WebMCP and without it.
 */
export function createBridgeModelContext({
  bridgeUrl,
  nativeModelContext,
}: {
  bridgeUrl: string;
  nativeModelContext?: ModelContext;
}): ModelContext {
  const tools = new Map<string, WebMcpTool>();
  let disconnect: (() => void) | undefined;

  function removeTool(tool: WebMcpTool) {
    tools.delete(tool.name);
    if (tools.size === 0) {
      disconnect?.();
      disconnect = undefined;
    }
  }

  return {
    registerTool: async (tool, options) => {
      // Check and record the name in one step, so a second registration of
      // the name is rejected even before the first one resolves.
      if (tools.has(tool.name)) {
        throw new DOMException(
          `tool already registered: ${tool.name}`,
          "InvalidStateError",
        );
      }
      const signal = options?.signal;
      if (signal?.aborted) {
        return;
      }
      tools.set(tool.name, tool);
      signal?.addEventListener("abort", () => removeTool(tool), {
        once: true,
      });
      disconnect ??= connectWebMcpBridge({ bridgeUrl, tools });
      try {
        await nativeModelContext?.registerTool(tool, options);
      } catch (error) {
        removeTool(tool);
        throw error;
      }
    },
  };
}

/**
 * Connects the page to the local bridge in server.ts and exposes `tools`, by
 * name, to the agent. Each request reads `tools` as it is then, so tools
 * added or removed later are served without reconnecting. The bridge streams
 * requests over Server-Sent Events, and each result, or the error a tool
 * throws, is posted back as JSON. Returns a function that disconnects.
 */
function connectWebMcpBridge({
  bridgeUrl,
  tools,
}: {
  bridgeUrl: string;
  tools: ReadonlyMap<string, WebMcpTool>;
}): () => void {
  const connectUrl = new URL(PAGE_ENDPOINTS.connect, bridgeUrl);
  connectUrl.searchParams.set("url", window.location.href);
  const rpc = createPageRpc(tools);
  const source = new EventSource(connectUrl);
  source.addEventListener(PAGE_EVENTS.request, async (event) => {
    const { requestId, method, args } = JSON.parse(
      event.data,
    ) as PageEvents[typeof PAGE_EVENTS.request];
    let body: string;
    try {
      const value = await (
        rpc[method as keyof PageRpc] as (...args: unknown[]) => unknown
      )(...args);
      // Serialize inside try, so a non-JSON value is reported as an error.
      body = JSON.stringify({
        requestId,
        ok: true,
        value,
      } satisfies RpcResponse);
    } catch (error) {
      body = JSON.stringify({
        requestId,
        ok: false,
        error:
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
      } satisfies RpcResponse);
    }
    // Posted as text/plain so the request needs no CORS preflight.
    await fetch(new URL(PAGE_ENDPOINTS.result, bridgeUrl), {
      method: "POST",
      body,
    });
  });
  return () => source.close();
}

function createPageRpc(tools: ReadonlyMap<string, WebMcpTool>): PageRpc {
  return {
    getTools: () =>
      [...tools.values()].map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
    executeTool: async ({ name }, input) => {
      const tool = tools.get(name);
      if (!tool) {
        throw new Error(`unknown tool: ${name}`);
      }
      return await tool.execute(input);
    },
  };
}
