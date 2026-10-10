// The part of the WebMCP API (https://webmachinelearning.github.io/webmcp/)
// this package uses, as `document.modelContext`.

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

export interface ModelContext {
  /** Aborting `signal` unregisters the tool. */
  registerTool(
    tool: WebMcpTool,
    options?: { signal?: AbortSignal },
  ): Promise<void>;
  getTools(): Promise<RegisteredTool[]>;
  /** Resolves to the tool's result as a JSON string. */
  executeTool(tool: RegisteredTool, input: object): Promise<string>;
}

/** `execute` resolves to a JSON-serializable result. */
export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: object;
  execute: (input: any) => WebMcpToolResult | Promise<WebMcpToolResult>;
}

/**
 * WebMCP hides a thrown error's message from the agent, so a tool reports a
 * failure the agent can act on in its result, as with `isError` in MCP tool
 * results.
 */
export type WebMcpToolResult =
  | { isError: false; value?: unknown }
  | { isError: true; error: string };

export interface RegisteredTool {
  name: string;
  description: string;
  inputSchema?: object;
  origin: string;
  window: Window;
}
