import type { AgentTool } from "@hiogawa/agent-bridge/client";
import type { RecorderRuntime } from "./recorder/runtime";

const AsyncFunction = async function () {}.constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

/**
 * Tools for an agent to act on the open project, in the WebMCP tool
 * shape.
 */
export function createAgentTools(runtime: RecorderRuntime): AgentTool[] {
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
      execute: ({ code }: { code: string }) =>
        new AsyncFunction("runtime", code)(runtime),
    },
  ];
}
