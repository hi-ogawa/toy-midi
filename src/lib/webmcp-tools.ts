import type { WebMcpTool } from "@hiogawa/webmcp-bridge/webmcp";

const AsyncFunction = async function () {}.constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

/**
 * Tools for an agent to act on the open project, in the WebMCP tool
 * shape.
 */
export function createWebMcpTools(): WebMcpTool[] {
  return [
    {
      name: "toy_midi_eval",
      description: [
        "Run JavaScript against the open toy-midi project, with `toyMidi`, the page's `window.toyMidi`, in scope.",
        `Its API is declared as \`ToyMidiGlobal\` in ${new URL("/llms/toy-midi.d.ts", window.location.origin)}. Read it before writing code.`,
      ].join("\n\n"),
      inputSchema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description:
              "Body of an async function with `toyMidi` in scope. Return a JSON-serializable value.",
          },
        },
        required: ["code"],
      },
      execute: async ({ code }: { code: string }) => {
        // Serialize here, so a non-JSON value becomes an error the agent can
        // read.
        try {
          const value = await new AsyncFunction(code)();
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
