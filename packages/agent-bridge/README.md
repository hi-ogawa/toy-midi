# Agent Bridge

`agent-bridge` lets a local agent with a shell, such as Claude Code, call tools that an open web app exposes and read the results. The app has no server of its own, so the page connects to a small local process, and the agent talks to that process from the command line.

Install the CLI globally from GitHub:

```sh
pnpm i -g "github:hi-ogawa/toy-midi#path:/packages/agent-bridge"
```

Other apps depend on the page client the same way, pinned to a commit with `github:hi-ogawa/toy-midi#<sha>&path:/packages/agent-bridge`. The package ships TypeScript source, so the app's bundler compiles it.

```sh
agent-bridge serve --origin https://toy-midi.hiro18181.workers.dev
agent-bridge get-tools
agent-bridge execute-tool toy_midi_eval --arg code='return runtime.store.get().tempo'
```

The page decides which tools it exposes when it connects. A tool has the [WebMCP](https://webmachinelearning.github.io/webmcp/) shape, so the same definitions can later be registered with `document.modelContext`:

```ts
import { connectAgentBridge } from "@hiogawa/agent-bridge/client";

const disconnect = connectAgentBridge({
  bridgeUrl: "http://localhost:4747",
  tools: [
    {
      name: "set_tempo",
      description: "Set the project tempo in BPM.",
      inputSchema: {
        type: "object",
        properties: { bpm: { type: "number" } },
        required: ["bpm"],
      },
      execute: ({ bpm }) => {
        runtime.setTempo(bpm);
        return { isError: false };
      },
    },
  ],
});
```

Only pages from the listed origins can connect. The agent endpoints reject any request that carries an `Origin` header, so other sites cannot drive the page.

## Contract

The bridge listens on `127.0.0.1`, port 4747 by default. Pages and agents use separate endpoints, and the `Origin` header tells them apart: page requests must carry a listed origin, and agent requests must carry none. Anything else gets 403. Every request must also be addressed to `localhost` or `127.0.0.1` in its `Host` header, so a site that rebinds its DNS to the loopback address cannot reach the agent endpoints as same-origin.

### Calls

- `execute` receives the input object and resolves to `{ isError: false, value? }` on success or `{ isError: true, error }` on failure, as with `isError` in MCP tool results. WebMCP hides a thrown error's message from the agent, so a failure the agent can act on belongs in the result.
- The result must be JSON-serializable. A value that `JSON.stringify` rejects, such as a circular object, comes back as an error.
- The bridge itself reports a thrown error, or a call to an unknown tool, with its stack.
- The bridge waits 30 seconds for the page before failing with a timeout. The tool keeps running in the page after that.
- A request goes to the most recently connected page unless one is chosen by id.

### CLI

| Command                                   | Input                                                   | Output                                                                                           |
| ----------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `agent-bridge serve`                      | `--origin <origin>`, repeatable, required               | Runs the bridge in the foreground and logs pages connecting and leaving                          |
| `agent-bridge get-tools`                  |                                                         | Each tool's name, description, and input schema as plain text                                    |
| `agent-bridge execute-tool <tool> [json]` | Input JSON, default `{}`, plus `--arg key=value` fields | The `value` of the result, a string as is, anything else as indented JSON, or nothing when empty |
| `agent-bridge pages`                      |                                                         | Connected pages as indented JSON on stdout                                                       |

Every command takes `--port <number>`, and `serve --port 0` listens on a free port and logs it. `get-tools` and `execute-tool` take `--page <id>` to choose the page. `--arg` is repeatable and sets a string field, and a value of `-` reads stdin, so code or long text can be piped in without JSON escaping. A failed request, an `isError` result, a timeout, no connected page, or no running bridge prints the error to stderr and exits with code 1, so the agent can tell success from failure by exit code alone.

### Agent endpoints

| Request                      | Body              | Response                                                                              |
| ---------------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| `GET /get-tools?page=id`     |                   | 200 `{ ok: true, value: [{ name, description, inputSchema }] }`                       |
| `POST /execute-tool?page=id` | `{ name, input }` | 200 `{ ok: true, value? }`, 500 `{ ok: false, error }`, 503 when no page is connected |
| `GET /pages`                 |                   | `[{ id, origin, url, connectedAt }]`                                                  |

### Page endpoints

| Request                 | Body                                                                        | Response                                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /connect?url=href` |                                                                             | Server-Sent Events: `hello` `{ pageId }`, then `request` `{ requestId, method, args }`, which calls `getTools()` or `executeTool({ name }, input)` on the page, named after WebMCP's `ModelContext` |
| `POST /result`          | JSON `{ requestId, ok: true, value? }` or `{ requestId, ok: false, error }` | 204                                                                                                                                                                                                 |

The methods and message types are in `src/protocol.ts`. The bridge sends a comment every 15 seconds to keep the stream open. A page that reconnects gets a new id. `connectAgentBridge` implements the page side, posting results as `text/plain` so they need no CORS preflight.
