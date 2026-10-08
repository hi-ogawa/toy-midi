# Agent Bridge

`agent-bridge` lets a local agent with a shell, such as Claude Code, run JavaScript in an open web app and read the result. The app has no server of its own, so the page connects to a small local process, and the agent talks to that process from the command line.

Each toy-midi commit publishes the package to [pkg.pr.new](https://pkg.pr.new), so other apps can depend on it and the CLI can be installed globally:

```sh
pnpm i -g https://pkg.pr.new/hi-ogawa/toy-midi/@hiogawa/agent-bridge@<sha>
```

```sh
agent-bridge serve --origin https://toy-midi.hiro18181.workers.dev
agent-bridge eval 'return app.runtime.store.get().tempo'
```

Each `eval` runs as an async function body with `app` in scope, and its return value is printed as JSON. The page decides what `app` is when it connects:

```ts
import { connectAgentBridge } from "@hiogawa/agent-bridge/client";

const disconnect = connectAgentBridge({
  bridgeUrl: "http://localhost:4747",
  app: { runtime },
});
```

By convention, a page documents what it exposes as a plain-text `app.__agent_bridge_doc__`, and `agent-bridge --help` tells agents to read it before anything else. The bridge itself does not know about it.

Only pages from the listed origins can connect. The agent endpoints reject any request that carries an `Origin` header, so other sites cannot drive the page.

## Contract

The bridge listens on `127.0.0.1`, port 4747 by default. Pages and agents use separate endpoints, and the `Origin` header tells them apart: page requests must carry a listed origin, and agent requests must carry none. Anything else gets 403.

### Eval

- The code is the body of an async function called with one argument, `app`. It can `await`, and its `return` value is the result.
- The result must be JSON-serializable. A value that `JSON.stringify` rejects, such as a circular object, comes back as an error. Returning nothing gives an empty result.
- A thrown error comes back with its stack.
- The bridge waits 30 seconds for the page before failing with a timeout. The code keeps running in the page after that.
- An eval goes to the most recently connected page unless one is chosen by id.

### CLI

| Command                    | Input                                     | Output                                                                       |
| -------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| `agent-bridge serve`       | `--origin <origin>`, repeatable, required | Runs the bridge in the foreground and logs pages connecting and leaving      |
| `agent-bridge eval [code]` | Code from the argument, or stdin without  | A string result as is, anything else as indented JSON, or nothing when empty |
| `agent-bridge pages`       |                                           | Connected pages as indented JSON on stdout                                   |

Every command takes `--port <number>`, and `eval` takes `--page <id>` to choose the page. A failed eval, a timeout, no connected page, or no running bridge prints the error to stderr and exits with code 1, so the agent can tell success from failure by exit code alone.

### Agent endpoints

| Request              | Body      | Response                                                                              |
| -------------------- | --------- | ------------------------------------------------------------------------------------- |
| `POST /eval?page=id` | code text | 200 `{ ok: true, value? }`, 500 `{ ok: false, error }`, 503 when no page is connected |
| `GET /pages`         |           | `[{ id, origin, url, connectedAt }]`                                                  |

### Page endpoints

| Request                 | Body                                                                        | Response                                                                    |
| ----------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `GET /connect?url=href` |                                                                             | Server-Sent Events: `hello` `{ pageId }`, then `eval` `{ requestId, code }` |
| `POST /result`          | JSON `{ requestId, ok: true, value? }` or `{ requestId, ok: false, error }` | 204                                                                         |

The bridge sends a comment every 15 seconds to keep the stream open. A page that reconnects gets a new id. `connectAgentBridge` implements the page side, posting results as `text/plain` so they need no CORS preflight.
