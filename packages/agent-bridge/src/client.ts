// Page client for the local agent bridge in cli.ts. The page exposes tools in
// the WebMCP shape, and the bridge streams requests to list or call them over
// Server-Sent Events. Each result, or the error a tool throws, is posted back
// as JSON.

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: object;
  execute: (input: any) => unknown;
}

export type AgentBridgeRequest =
  | { method: "list" }
  | { method: "call"; name: string; input: unknown };

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
