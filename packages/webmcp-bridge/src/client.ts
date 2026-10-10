import {
  PAGE_ENDPOINTS,
  PAGE_EVENTS,
  type PageEvents,
  type PageRpc,
} from "./protocol.ts";
import type { RpcResponse } from "./rpc.ts";
import type { ModelContext, WebMcpToolResult } from "./webmcp.ts";

/**
 * Exposes the tools of `modelContext` to the agent through the local bridge
 * in server.ts, until the returned function is called. Each request reads
 * the tools with `getTools()` and runs them with `executeTool()`, as an agent
 * built into the browser would.
 *
 * The bridge streams requests over Server-Sent Events, and each result, or
 * the error a call throws, is posted back as JSON.
 */
export function exposeModelContext({
  bridgeUrl,
  modelContext,
}: {
  bridgeUrl: string;
  modelContext: ModelContext;
}): () => void {
  const connectUrl = new URL(PAGE_ENDPOINTS.connect, bridgeUrl);
  connectUrl.searchParams.set("url", window.location.href);
  const rpc = createPageRpc(modelContext);
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

function createPageRpc(modelContext: ModelContext): PageRpc {
  return {
    // A native tool also holds its `window`, which cannot be sent as JSON, so
    // keep the fields the agent reads.
    getTools: async () =>
      (await modelContext.getTools()).map(
        ({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        }),
      ),
    executeTool: async ({ name }, input) => {
      const tools = await modelContext.getTools();
      const tool = tools.find((tool) => tool.name === name);
      if (!tool) {
        throw new Error(`unknown tool: ${name}`);
      }
      return JSON.parse(
        await modelContext.executeTool(tool, input as object),
      ) as WebMcpToolResult;
    },
  };
}
