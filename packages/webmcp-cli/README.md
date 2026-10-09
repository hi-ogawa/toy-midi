# WebMCP CLI

WebMCP CLI lets an agent working in a terminal, such as Claude Code, call the tools that a web page open in your browser exposes in the shape of [WebMCP](https://webmachinelearning.github.io/webmcp/), a proposed browser API for agents. The page connects to a small server on your machine, the bridge, and the agent talks to the bridge with the `webmcp-cli` command.

## Usage

Install the command from GitHub:

```sh
pnpm i -g "github:hi-ogawa/toy-midi#path:/packages/webmcp-cli"
```

Run the bridge, listing each site whose pages may connect. It stays in the foreground and logs pages as they connect and leave:

```console
$ webmcp-cli serve --origin https://toy-midi.hiro18181.workers.dev
[webmcp-cli] listening on http://127.0.0.1:4747/
[webmcp-cli] accepting pages from https://toy-midi.hiro18181.workers.dev
[webmcp-cli] page cbfe8f6b connected from https://toy-midi.hiro18181.workers.dev/recorder/082669e2-…?webmcp-cli
```

Then open the app so that it connects. Toy MIDI connects when a project is opened with `?webmcp-cli` at the end of its URL. The commands below run from another terminal, or from the agent.

### `webmcp-cli pages`

Lists the connected pages:

```console
$ webmcp-cli pages
[
  {
    "id": "cbfe8f6b",
    "origin": "https://toy-midi.hiro18181.workers.dev",
    "url": "https://toy-midi.hiro18181.workers.dev/recorder/082669e2-…?webmcp-cli",
    "connectedAt": "2026-10-09T18:11:40.672Z"
  }
]
```

### `webmcp-cli get-tools`

Describes the page's tools. Each comes with its description and input schema, which is all the agent needs to call it:

```console
$ webmcp-cli get-tools
# toy_midi_eval

Run JavaScript against the open toy-midi project. `runtime` owns the project state and playback. Read state with `runtime.store.get()` and change it only through runtime methods.

## Input schema

{
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "description": "Body of an async function with `runtime` in scope. Return a JSON-serializable value."
    }
  },
  "required": [
    "code"
  ]
}
```

### `webmcp-cli execute-tool <tool> [json]`

Runs a tool with the JSON input, `{}` by default, and prints the result as JSON, or as is when it is a string:

```console
$ webmcp-cli execute-tool toy_midi_eval --arg code='return runtime.store.get().tempo'
120
```

`--arg key=value` sets one string field of the input and can be repeated. A value of `-` reads the field from standard input, so code or long text can be piped in without escaping it as JSON:

```console
$ webmcp-cli execute-tool toy_midi_eval --arg code=- <<'JS'
await runtime.addMidiTrack({ program: 33 });
const id = runtime.store.get().midiTracks.at(-1).id;
runtime.setMidiTrackNotes(id, [
  { id: crypto.randomUUID(), pitch: 33, start: 0, duration: 1, velocity: 100 },
]);
return runtime.store.get().midiTracks.map(({ name, program, notes }) => ({ name, program, notes: notes.length }));
JS
[
  {
    "name": "MIDI 1",
    "program": 33,
    "notes": 1
  }
]
```

A tool that fails prints its error to standard error:

```console
$ webmcp-cli execute-tool toy_midi_eval --arg code='return runtime.nope()'
TypeError: runtime.nope is not a function
    at eval (eval at execute (…/src/lib/webmcp-tools.ts:23:25), <anonymous>:3:16)
    …
$ echo $?
1
```

### Options

- `--port <number>` chooses the bridge's port for every command, 4747 by default. `serve --port 0` picks a free port and prints it.
- `--origin <origin>` lists a site whose pages may connect. `serve` requires at least one, and it can be repeated.
- `--page <id>` chooses the page for `get-tools` and `execute-tool`. Without it they use the only connected page, and fail with the list of ids when several pages are connected.

### Exit Code

Any failure prints a message to standard error and exits with code 1, so the agent can tell success from failure by the exit code alone. Failures include a tool that reports an error, a timeout, no connected page, several connected pages without `--page`, and no running bridge.

## Exposing Tools from an App

An app adds the client to its page and passes the tools it wants to offer. Apps depend on the package from GitHub, pinned to a commit with `github:hi-ogawa/toy-midi#<sha>&path:/packages/webmcp-cli`. The package ships TypeScript source, so the app's bundler compiles it.

```ts
import { connectWebMcpCli } from "@hiogawa/webmcp-cli/client";

const disconnect = connectWebMcpCli({
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

## How It Works

![The page opens a connection to the bridge once and keeps it open. When the command line sends a request, the bridge holds it open, passes the request down the page's connection, and waits for the page to send back the result, which becomes the answer to the command line.](images/rpc-flow.svg)

A web app with no server of its own cannot be reached from a terminal, so the bridge runs on your machine where both sides can reach it. The bridge cannot open a connection to a browser page, though. So when the app connects, the page opens a connection to the bridge and keeps it open. The bridge uses that open connection to send requests to the page later, using [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events).

When the agent runs `webmcp-cli get-tools` or `execute-tool`, the command sends an ordinary HTTP request to the bridge, and the bridge does not answer right away. It passes the request down the page's open connection, tagged with a new id. The page runs the tool and sends the result back to the bridge in a separate HTTP request with the same id. The bridge matches the id, and the result becomes its answer to the waiting command.

The bridge only passes requests along and does not know which tools or operations exist. Only the command line and the page client need to agree on those, so adding a new kind of request does not change the bridge.

Each open connection is one page, and the bridge gives each a short id when it connects. `webmcp-cli pages` lists them, and the bridge answers it from its own list without asking any page. A page that reloads connects again and gets a new id.

## Security

The bridge only accepts connections from your own machine. Within your machine, it tells pages and the command line apart by the `Origin` header, which a browser adds when a web page sends a request to another site and a terminal command does not send:

- Pages may connect only from the sites listed with `--origin`.
- Requests meant for the command line are refused if they carry an `Origin` header at all, so a page on another site cannot run tools.

Every request must also be addressed to `localhost` or `127.0.0.1`. That stops a site that points its own domain name at your machine. Its page would otherwise count as the bridge's own site, so the browser would send no `Origin` header and let the page read the bridge's answers.
