# Agent Bridge

Agent Bridge lets a coding agent that works in a terminal, such as Claude Code, use a web app that is open in your browser. The page offers a set of tools, which are functions with a name, a description, and an input format. The agent lists those tools and runs them from the command line, and each result comes back as text it can read.

A web app with no server of its own cannot be reached from the terminal directly. Agent Bridge adds a small server that runs on your machine. The page connects to it, and the `agent-bridge` command talks to it.

## Set Up the Bridge

Install the command globally from GitHub:

```sh
pnpm i -g "github:hi-ogawa/toy-midi#path:/packages/agent-bridge"
```

Start the bridge, and list each site whose pages may connect to it:

```sh
agent-bridge serve --origin https://toy-midi.hiro18181.workers.dev
```

Then open the app so that it connects. Toy MIDI connects when a project is opened with `?agent-bridge` at the end of its URL. From another terminal, or from the agent, list the page's tools and run one:

```sh
agent-bridge get-tools
agent-bridge execute-tool toy_midi_eval --arg code='return runtime.store.get().tempo'
```

## Expose Tools from a Page

An app adds the client to its page and passes the tools it wants to offer. Apps depend on the package from GitHub, pinned to a commit with `github:hi-ogawa/toy-midi#<sha>&path:/packages/agent-bridge`. The package ships TypeScript source, so the app's bundler compiles it.

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

A tool has the same shape as in [WebMCP](https://webmachinelearning.github.io/webmcp/), a proposed browser API for the same purpose, so the same definitions can later be registered with the browser directly.

- `execute` receives the input and returns `{ isError: false, value }` on success or `{ isError: true, error }` on failure, as MCP tools do. A tool reports a failure the agent can act on in its result, because WebMCP hides the message of a thrown error from the agent.
- The result must be convertible to JSON. A value that is not, such as an object that refers to itself, comes back as an error.
- If the tool throws anyway, or the agent names a tool that does not exist, the bridge reports the error with its stack trace.
- The bridge gives up after 30 seconds without a result. The tool keeps running in the page after that.

## Command Reference

| Command                                   | Input                                                   | Output                                                                                           |
| ----------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `agent-bridge serve`                      | `--origin <origin>`, repeatable, required               | Runs the bridge in the foreground and logs pages connecting and leaving                          |
| `agent-bridge get-tools`                  |                                                         | Each tool's name, description, and input schema as plain text                                    |
| `agent-bridge execute-tool <tool> [json]` | Input JSON, default `{}`, plus `--arg key=value` fields | The `value` of the result, a string as is, anything else as indented JSON, or nothing when empty |
| `agent-bridge pages`                      |                                                         | Connected pages as indented JSON                                                                 |

Every command takes `--port <number>`, which defaults to 4747. `serve --port 0` picks a free port and prints it. `get-tools` and `execute-tool` take `--page <id>` to choose a page. Without it they use the only connected page, and fail with the list of ids when several pages are connected.

`--arg` sets one string field of the input and can be repeated. A value of `-` reads the field from standard input, so code or long text can be piped in without escaping it as JSON.

Any failure prints a message to standard error and exits with code 1, so the agent can tell success from failure by the exit code alone. Failures include a tool that reports an error, a timeout, no connected page, several connected pages without `--page`, and no running bridge.

## How It Works

![The page opens a connection to the bridge once and keeps it open. When the command line sends a request, the bridge holds it open, passes the request down the page's connection, and waits for the page to send back the result, which becomes the answer to the command line.](images/rpc-flow.svg)

The command line and the page can both reach the bridge, but the bridge cannot open a connection to a browser page. So when the app connects, the page opens a connection to the bridge and keeps it open. The bridge uses that open connection to send requests to the page later, using [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events).

When the agent runs `agent-bridge get-tools` or `execute-tool`, the command sends an ordinary HTTP request to the bridge, and the bridge does not answer right away. It passes the request down the page's open connection, tagged with a new id. The page runs the tool and sends the result back to the bridge in a separate HTTP request with the same id. The bridge matches the id, and the result becomes its answer to the waiting command.

The bridge only passes requests along and does not know which tools or operations exist. Only the command line and the page client need to agree on those, so adding a new kind of request does not change the bridge.

Each open connection is one page, and the bridge gives each a short id when it connects. `agent-bridge pages` lists them, and the bridge answers it from its own list without asking any page. A page that reloads connects again and gets a new id.

### Security

The bridge only accepts connections from your own machine. Within your machine, it tells pages and the command line apart by the `Origin` header, which a browser adds when a web page sends a request to another site and a terminal command does not send:

- Pages may connect only from the sites listed with `--origin`.
- Requests meant for the command line are refused if they carry an `Origin` header at all, so a page on another site cannot run tools.

Every request must also be addressed to `localhost` or `127.0.0.1`. That stops a site that points its own domain name at your machine. Its page would otherwise count as the bridge's own site, so the browser would send no `Origin` header and let the page read the bridge's answers.
