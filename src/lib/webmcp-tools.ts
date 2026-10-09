import type { WebMcpTool } from "@hiogawa/webmcp-cli/client";
import type { RecorderRuntime } from "./recorder/runtime";

const AsyncFunction = async function () {}.constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

/**
 * Tools for an agent to act on the open project, in the WebMCP tool
 * shape.
 */
export function createWebMcpTools(runtime: RecorderRuntime): WebMcpTool[] {
  return [
    {
      name: "toy_midi_eval",
      description:
        "Run JavaScript against the open toy-midi project. `runtime` owns the project state and playback. Read state with `runtime.store.get()` and change it only through runtime methods.",
      inputSchema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description:
              "Body of an async function with `runtime` in scope. Return a JSON-serializable value.",
          },
        },
        required: ["code"],
      },
      execute: async ({ code }: { code: string }) => {
        // WebMCP hides a thrown error's message from the agent, so failures
        // come back in the result. Serialize here for the same reason, so a
        // non-JSON value becomes an error the agent can read.
        try {
          const value = await new AsyncFunction("runtime", code)(runtime);
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
