import type { ModelContext, WebMcpTool } from "./webmcp.ts";

/**
 * A `document.modelContext` for browsers without WebMCP. It behaves as the
 * spec describes: a duplicate name is rejected, `executeTool` resolves to the
 * result's JSON, and a tool that throws fails as an `OperationError` without
 * its message.
 */
export function createModelContextPolyfill(): ModelContext {
  const tools = new Map<string, WebMcpTool>();
  return {
    registerTool: async (tool, options) => {
      if (tools.has(tool.name)) {
        throw new DOMException(
          `tool already registered: ${tool.name}`,
          "InvalidStateError",
        );
      }
      const signal = options?.signal;
      if (signal?.aborted) {
        return;
      }
      tools.set(tool.name, tool);
      signal?.addEventListener("abort", () => tools.delete(tool.name), {
        once: true,
      });
    },
    getTools: async () =>
      [...tools.values()].map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
    executeTool: async ({ name }, input) => {
      const tool = tools.get(name);
      if (!tool) {
        throw new DOMException(`unknown tool: ${name}`, "NotFoundError");
      }
      let result: unknown;
      try {
        result = await tool.execute(input);
      } catch (error) {
        console.warn(error);
        throw new DOMException("tool rejected", "OperationError");
      }
      return JSON.stringify(result);
    },
  };
}
