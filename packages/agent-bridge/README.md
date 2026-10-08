# Agent Bridge

`agent-bridge` lets a local agent with a shell, such as Claude Code, run JavaScript in an open web app and read the result. The app has no server of its own, so the page connects to a small local process, and the agent talks to that process from the command line.

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

Only pages from the listed origins can connect. The agent endpoints reject any request that carries an `Origin` header, so other sites cannot drive the page.
