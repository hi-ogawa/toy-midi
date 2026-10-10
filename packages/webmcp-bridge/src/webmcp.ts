// The part of the WebMCP API (https://webmachinelearning.github.io/webmcp/)
// that pages and the extension use, as `document.modelContext`.

/**
 * A tool in the WebMCP shape, as passed to `document.modelContext.registerTool`.
 * `execute` receives the input object and resolves to a JSON-serializable
 * `WebMcpToolResult`.
 */
export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: object;
  execute: (input: any) => WebMcpToolResult | Promise<WebMcpToolResult>;
}

/**
 * WebMCP hides a thrown error's message from the agent, so a tool reports a
 * failure the agent can act on in its result, as with `isError` in MCP tool
 * results. The CLI prints `value` on success, and prints `error` and exits
 * with code 1 on failure.
 */
export type WebMcpToolResult =
  | { isError: false; value?: unknown }
  | { isError: true; error: string };

/** `document.modelContext`. Aborting `signal` unregisters the tool. */
export interface ModelContext {
  registerTool(
    tool: WebMcpTool,
    options?: { signal?: AbortSignal },
  ): Promise<void>;
}

declare global {
  interface Document {
    /** Present in browsers with WebMCP, or with the webmcp-bridge extension. */
    modelContext?: ModelContext;
  }
}
