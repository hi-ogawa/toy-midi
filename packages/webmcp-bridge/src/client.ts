import {
  PAGE_ENDPOINTS,
  PAGE_EVENTS,
  type PageEvents,
  type PageRpc,
} from "./protocol.ts";
import type { RpcResponse } from "./rpc.ts";
import type { ModelContext, WebMcpToolResult } from "./webmcp.ts";

export { DEFAULT_BRIDGE_PORT } from "./protocol.ts";

/**
 * `connecting` also covers retrying while the bridge is not running, and
 * `closed` means the bridge refused the page, as for an origin it does not
 * accept.
 */
export type BridgeStatus = "connecting" | "connected" | "closed";

/**
 * Exposes the tools of `modelContext` to the agent through the local bridge,
 * until the returned function is called. Each request reads the tools with
 * `getTools()` and runs them with `executeTool()`, as an agent built into the
 * browser would.
 */
export function exposeModelContext({
  bridgeUrl,
  modelContext,
  onStatus,
}: {
  bridgeUrl: string;
  modelContext: ModelContext;
  onStatus?: (status: BridgeStatus) => void;
}): () => void {
  const handleRequest = createRequestHandler(modelContext);
  const connection = connectBridge({
    bridgeUrl,
    pageUrl: window.location.href,
    onRequest: async (request) =>
      connection.postResult(await handleRequest(request)),
    onStatus,
  });
  return connection.close;
}

/**
 * Opens a page's connection to the bridge. Requests and results travel as
 * JSON text, so a connection opened on the page's behalf, as the extension
 * does, can pass them along without reading them.
 */
export function connectBridge({
  bridgeUrl,
  pageUrl,
  onRequest,
  onStatus,
}: {
  bridgeUrl: string;
  pageUrl: string;
  onRequest: (request: string) => void;
  onStatus?: (status: BridgeStatus) => void;
}) {
  const connectUrl = new URL(PAGE_ENDPOINTS.connect, bridgeUrl);
  connectUrl.searchParams.set("url", pageUrl);
  const source = new EventSource(connectUrl);
  onStatus?.("connecting");
  source.addEventListener("open", () => onStatus?.("connected"));
  source.addEventListener("error", () =>
    onStatus?.(
      source.readyState === EventSource.CLOSED ? "closed" : "connecting",
    ),
  );
  source.addEventListener(PAGE_EVENTS.request, (event) =>
    onRequest(event.data),
  );
  return {
    postResult: async (result: string) => {
      // Posted as text/plain so the request needs no CORS preflight.
      await fetch(new URL(PAGE_ENDPOINTS.result, bridgeUrl), {
        method: "POST",
        body: result,
      });
    },
    close: () => source.close(),
  };
}

/**
 * Answers a request from the bridge by calling `modelContext`, both as JSON
 * text.
 */
export function createRequestHandler(modelContext: ModelContext) {
  const rpc = createPageRpc(modelContext);
  return async (request: string): Promise<string> => {
    const { requestId, method, args } = JSON.parse(
      request,
    ) as PageEvents[typeof PAGE_EVENTS.request];
    try {
      const value = await (
        rpc[method as keyof PageRpc] as (...args: unknown[]) => unknown
      )(...args);
      // Serialize inside try, so a non-JSON value is reported as an error.
      return JSON.stringify({
        requestId,
        ok: true,
        value,
      } satisfies RpcResponse);
    } catch (error) {
      return JSON.stringify({
        requestId,
        ok: false,
        error:
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
      } satisfies RpcResponse);
    }
  };
}

function createPageRpc(modelContext: ModelContext): PageRpc {
  return {
    getTools: async () => {
      const tools = await modelContext.getTools();
      return tools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      }));
    },
    executeTool: async ({ name }, input) => {
      const tools = await modelContext.getTools();
      const tool = tools.find((tool) => tool.name === name);
      if (!tool) {
        throw new Error(`unknown tool: ${name}`);
      }
      const result = await modelContext.executeTool(tool, input as object);
      return JSON.parse(result) as WebMcpToolResult;
    },
  };
}
