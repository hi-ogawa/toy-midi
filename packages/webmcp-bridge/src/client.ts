import {
  PAGE_ENDPOINTS,
  PAGE_EVENTS,
  type PageEvents,
  type PageRpc,
} from "./protocol.ts";
import type { RpcResponse } from "./rpc.ts";
import type { WebMcpTool } from "./webmcp.ts";

/**
 * Connects the page to the local bridge in server.ts and exposes `tools`, by
 * name, to the agent. Each request reads `tools` as it is then, so tools
 * added or removed later are served without reconnecting. The bridge streams
 * requests over Server-Sent Events, and each result, or the error a tool
 * throws, is posted back as JSON. Returns a function that disconnects.
 */
export function connectWebMcpBridge({
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
