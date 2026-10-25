import type { WebMcpTool } from "@hiogawa/webmcp-bridge/webmcp";
import { createSharedProject } from "./project-share";
import type { EditorRuntime } from "./runtime";

const AsyncFunction = async function () {}.constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

/**
 * Tools for an agent to act on the open project, in the WebMCP tool
 * shape.
 */
export function createWebMcpTools(runtime: EditorRuntime): WebMcpTool[] {
  return [
    {
      name: "toy_midi_eval",
      description: [
        "Run JavaScript against the open toy-midi project, with `runtime` (`EditorRuntime`) and `utils` (`AgentUtils`) in scope.",
        `Both are declared in ${new URL("/llms/toy-midi.d.ts", window.location.origin)}. Read it before writing code.`,
      ].join("\n\n"),
      inputSchema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description:
              "Body of an async function with `runtime` and `utils` in scope. Return a JSON-serializable value.",
          },
        },
        required: ["code"],
      },
      execute: async ({ code }: { code: string }) => {
        // Serialize here, so a non-JSON value becomes an error the agent can
        // read.
        try {
          const value = await new AsyncFunction("runtime", "utils", code)(
            runtime,
            agentUtils,
          );
          return JSON.parse(JSON.stringify({ isError: false, value }));
        } catch (error) {
          return {
            isError: true,
            error:
              error instanceof Error
                ? (error.stack ?? error.message)
                : String(error),
          };
        }
      },
    },
  ];
}

/** Helpers in scope as `utils` in `toy_midi_eval`, beside the runtime. */
const agentUtils = {
  /** Converts `runtime.serializeProject()` to the format of share links and project files. */
  createSharedProject,
};

export type AgentUtils = typeof agentUtils;
