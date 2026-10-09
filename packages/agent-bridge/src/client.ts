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

/** A request the bridge streams to the page, to list or call its tools. */
export type AgentBridgeRequest =
  | { method: "list" }
  | { method: "call"; name: string; input: unknown };

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
  const source = new EventSource(connectUrl);
  source.addEventListener("request", async (event) => {
    const request = JSON.parse(event.data) as AgentBridgeRequest & {
      requestId: string;
    };
    let body: string;
    try {
      const value = await handleRequest(tools, request);
      body = JSON.stringify({ requestId: request.requestId, ok: true, value });
    } catch (error) {
      body = JSON.stringify({
        requestId: request.requestId,
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

async function handleRequest(tools: AgentTool[], request: AgentBridgeRequest) {
  switch (request.method) {
    case "list": {
      return tools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      }));
    }
    case "call": {
      const tool = tools.find((tool) => tool.name === request.name);
      if (!tool) {
        throw new Error(`unknown tool: ${request.name}`);
      }
      return await tool.execute(request.input);
    }
  }
}
