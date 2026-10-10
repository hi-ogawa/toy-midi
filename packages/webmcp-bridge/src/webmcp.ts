// The part of the WebMCP API (https://webmachinelearning.github.io/webmcp/)
// this package uses, as `document.modelContext`.

declare global {
  interface Document {
    /** Present in browsers with WebMCP, or once a polyfill is installed. */
    modelContext?: ModelContext;
  }
}

/** `document.modelContext`. */
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

/** A tool as `getTools()` describes it, without its `execute`. */
export interface RegisteredTool {
  name: string;
  description: string;
  inputSchema?: object;
  /** The origin of the page that registered the tool. */
  origin: string;
  /** The window that registered the tool. */
  window: Window;
}
