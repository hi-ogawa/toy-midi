import { PAGE_ENDPOINTS, type PageEvents, type PageRpc } from "./protocol.ts";
import type { RpcResponse } from "./rpc.ts";

/**
 * A tool in the WebMCP shape, so the same object can be registered with
 * `document.modelContext`. `execute` receives the input object and resolves
 * to a JSON-serializable `AgentToolResult`.
 */
export interface AgentTool {
  name: string;
  description: string;
  inputSchema: object;
  execute: (input: any) => AgentToolResult | Promise<AgentToolResult>;
}

/**
 * WebMCP hides a thrown error's message from the agent, so a tool reports a
 * failure the agent can act on in its result, as with `isError` in MCP tool
 * results. The CLI prints `value` on success, and prints `error` and exits
 * with code 1 on failure.
 */
export type AgentToolResult =
  | { isError: false; value?: unknown }
  | { isError: true; error: string };

/**
 * Connects the page to the local agent bridge in cli.ts and exposes `tools`
 * to the agent. The bridge streams requests over Server-Sent Events, and each
 * result, or the error a tool throws, is posted back as JSON. Returns a
 * function that disconnects.
 */
export function connectAgentBridge({
  bridgeUrl,
  tools,
}: {
  bridgeUrl: string;
  tools: AgentTool[];
}): () => void {
  const connectUrl = new URL(PAGE_ENDPOINTS.connect, bridgeUrl);
  connectUrl.searchParams.set("url", window.location.href);
  const rpc = createPageRpc(tools);
  const source = new EventSource(connectUrl);
  source.addEventListener(
    "request" satisfies keyof PageEvents,
    async (event) => {
      const { requestId, method, args } = JSON.parse(
        event.data,
      ) as PageEvents["request"];
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
    },
  );
  return () => source.close();
}

function createPageRpc(tools: AgentTool[]): PageRpc {
  return {
    getTools: () =>
      tools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
    executeTool: async ({ name }, input) => {
      const tool = tools.find((tool) => tool.name === name);
      if (!tool) {
        throw new Error(`unknown tool: ${name}`);
      }
      return await tool.execute(input);
    },
  };
}
