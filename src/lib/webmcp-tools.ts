import type { WebMcpTool } from "@hiogawa/webmcp-bridge/webmcp";
import type { RecorderRuntime } from "./recorder/runtime";

// The runtime API as one declaration file from `pnpm build-webmcp-tools-doc`,
// which `pnpm build` runs for deploys.
// Until that has run, the description goes without it.
const [runtimeTypes] = Object.values(
  import.meta.glob<string>(
    "../../.tmp/webmcp-tools-doc/webmcp-tools-doc.d.ts",
    {
      query: "?raw",
      import: "default",
      eager: true,
    },
  ),
);

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
      description: [
        "Run JavaScript against the open toy-midi project, with `runtime` in scope.",
        "Start by reading `runtime.store.get().projectNotes`, which holds the brief, chord chart, decisions, and feedback the user and earlier sessions left. Record your own intent and decisions there with `runtime.setProjectNotes()`, because the next session sees only the notes and the project.",
        runtimeTypes,
      ]
        .filter(Boolean)
        .join("\n\n"),
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
