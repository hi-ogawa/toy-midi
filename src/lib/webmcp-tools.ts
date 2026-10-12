import type { WebMcpTool } from "@hiogawa/webmcp-bridge/webmcp";
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
        "Run JavaScript against the open toy-midi project, with `runtime` in scope.",
        "The project's `comment` is free-form text where you can record and communicate your intent and decisions.",
        `The runtime's API is declared in ${new URL("/llms/toy-midi.d.ts", window.location.origin)}. Read it before writing code.`,
      ].join("\n\n"),
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
        // Serialize here, so a non-JSON value becomes an error the agent can
        // read.
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
