import type {
  BridgeResult,
  PageRequest,
  PageResult,
  PageRpc,
} from "./protocol.ts";

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
  const connectUrl = new URL("/connect", bridgeUrl);
  connectUrl.searchParams.set("url", window.location.href);
  const rpc = createPageRpc(tools);
  const source = new EventSource(connectUrl);
  source.addEventListener("request", async (event) => {
    const { requestId, method, args } = JSON.parse(event.data) as PageRequest;
    const serialize = (result: BridgeResult) =>
      JSON.stringify({ requestId, ...result } satisfies PageResult);
    let body: string;
    try {
      // Serialize inside try, so a non-JSON value is reported as an error.
      body = serialize({
        ok: true,
        value: await (rpc[method] as (...args: unknown[]) => unknown)(...args),
      });
    } catch (error) {
      body = serialize({
        ok: false,
        error:
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
      });
    }
    // Posted as text/plain so the request needs no CORS preflight.
    await fetch(new URL("/result", bridgeUrl), { method: "POST", body });
  });
  return () => source.close();
}

function createPageRpc(tools: AgentTool[]): PageRpc {
  return {
    listTools: () =>
      tools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
    callTool: async ({ name, input }) => {
      const tool = tools.find((tool) => tool.name === name);
      if (!tool) {
        throw new Error(`unknown tool: ${name}`);
      }
      return await tool.execute(input);
    },
  };
}
