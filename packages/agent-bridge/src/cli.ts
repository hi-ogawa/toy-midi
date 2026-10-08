// Local bridge between an open web app and an agent with a shell.
//
// A page connects to the bridge with Server-Sent Events and posts results
// back. The agent posts JavaScript to `/eval`, the bridge forwards it to the
// page, and the page's result becomes the response. The app decides what
// `app` is when it connects with the client in client.ts.
//
// Usage:
//   agent-bridge serve --origin https://example.com
//   agent-bridge eval 'return app.runtime.store.get().tempo'
//   echo 'await app.runtime.play()' | agent-bridge eval
//   agent-bridge pages

import { randomUUID } from "node:crypto";
import http from "node:http";
import { parseArgs } from "node:util";

const DEFAULT_PORT = 4747;
const EVAL_TIMEOUT_MS = 30_000;
const PING_INTERVAL_MS = 15_000;

const USAGE = `\
usage: agent-bridge <command> [options]

commands:
  serve            run the bridge
  eval [code]      run code in the connected page, from the argument or stdin.
                   The code is an async function body with \`app\` in scope,
                   and its return value is printed as JSON.
  pages            list connected pages

options:
  --port <number>    bridge port (default ${DEFAULT_PORT})
  --origin <origin>  page origin to accept, repeatable (serve only, required)
  --page <id>        target page (eval only, default the latest connected)
  -h, --help         show this help`;

interface Page {
  id: string;
  origin: string;
  url?: string;
  connectedAt: string;
  response: http.ServerResponse;
}

type EvalResult = { ok: true; value?: unknown } | { ok: false; error: string };

await main();

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: "string", default: String(DEFAULT_PORT) },
      origin: { type: "string", multiple: true },
      page: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, code] = positionals;
  const port = Number(values.port);
  if (values.help || !command) {
    console.log(USAGE);
    return;
  }
  switch (command) {
    case "serve": {
      if (!values.origin) {
        console.error("serve requires at least one --origin");
        process.exitCode = 1;
        return;
      }
      serve({ port, origins: values.origin });
      break;
    }
    case "eval": {
      await runEval({
        port,
        page: values.page,
        code: code ?? (await readStdin()),
      });
      break;
    }
    case "pages": {
      const response = await requestBridge({ port, path: "/pages" });
      if (response) {
        console.log(JSON.stringify(await response.json(), null, 2));
      }
      break;
    }
    default: {
      console.error(USAGE);
      process.exitCode = 1;
    }
  }
}

function serve({ port, origins }: { port: number; origins: string[] }) {
  const pages = new Map<string, Page>();
  const pending = new Map<string, (result: EvalResult) => void>();

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const origin = request.headers.origin;
    const route = `${request.method} ${url.pathname}`;

    // Requests from pages carry an Origin, and only listed origins may connect.
    // Agent requests come from a shell, so any request with an Origin is
    // rejected there, which keeps other sites from driving the page.
    if (
      route === "GET /connect" ||
      route === "POST /result" ||
      request.method === "OPTIONS"
    ) {
      if (!origin || !origins.includes(origin)) {
        response.writeHead(403).end("origin not allowed\n");
        return;
      }
      response.setHeader("access-control-allow-origin", origin);
    } else if (origin) {
      response
        .writeHead(403)
        .end("agent endpoints do not accept browser requests\n");
      return;
    }

    switch (route) {
      case "OPTIONS /connect":
      case "OPTIONS /result": {
        response.writeHead(204, {
          "access-control-allow-methods": "GET, POST",
          "access-control-allow-headers": "content-type",
          "access-control-allow-private-network": "true",
        });
        response.end();
        return;
      }
      case "GET /connect": {
        const page: Page = {
          id: randomUUID().slice(0, 8),
          origin: origin!,
          url: url.searchParams.get("url") ?? undefined,
          connectedAt: new Date().toISOString(),
          response,
        };
        pages.set(page.id, page);
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        });
        sendEvent(response, "hello", { pageId: page.id });
        const ping = setInterval(
          () => response.write(": ping\n\n"),
          PING_INTERVAL_MS,
        );
        request.on("close", () => {
          clearInterval(ping);
          pages.delete(page.id);
          console.log(`[agent-bridge] page ${page.id} disconnected`);
        });
        console.log(
          `[agent-bridge] page ${page.id} connected from ${page.url ?? origin}`,
        );
        return;
      }
      case "POST /result": {
        const { requestId, ...result } = JSON.parse(await readBody(request));
        pending.get(requestId)?.(result);
        response.writeHead(204).end();
        return;
      }
      case "GET /pages": {
        sendJson(
          response,
          200,
          [...pages.values()].map(({ id, origin, url, connectedAt }) => ({
            id,
            origin,
            url,
            connectedAt,
          })),
        );
        return;
      }
      case "POST /eval": {
        const pageId = url.searchParams.get("page") ?? [...pages.keys()].at(-1);
        const page = pageId ? pages.get(pageId) : undefined;
        if (!page) {
          sendJson(response, 503, { ok: false, error: "no page connected" });
          return;
        }
        const code = await readBody(request);
        const requestId = randomUUID();
        const result = await new Promise<EvalResult>((resolve) => {
          const timer = setTimeout(
            () =>
              resolve({
                ok: false,
                error: `timed out after ${EVAL_TIMEOUT_MS} ms`,
              }),
            EVAL_TIMEOUT_MS,
          );
          pending.set(requestId, (result) => {
            clearTimeout(timer);
            resolve(result);
          });
          sendEvent(page.response, "eval", { requestId, code });
        }).finally(() => pending.delete(requestId));
        sendJson(response, result.ok ? 200 : 500, result);
        return;
      }
      default: {
        response.writeHead(404).end("not found\n");
      }
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`[agent-bridge] listening on http://localhost:${port}`);
    console.log(`[agent-bridge] accepting pages from ${origins.join(", ")}`);
  });
}

async function runEval({
  port,
  page,
  code,
}: {
  port: number;
  page?: string;
  code: string;
}) {
  const response = await requestBridge({
    port,
    path: page ? `/eval?page=${encodeURIComponent(page)}` : "/eval",
    init: { method: "POST", body: code },
  });
  if (!response) {
    return;
  }
  const result = (await response.json()) as EvalResult;
  if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
    return;
  }
  if (result.value !== undefined) {
    console.log(JSON.stringify(result.value, null, 2));
  }
}

async function requestBridge({
  port,
  path,
  init,
}: {
  port: number;
  path: string;
  init?: RequestInit;
}): Promise<Response | undefined> {
  try {
    return await fetch(`http://127.0.0.1:${port}${path}`, init);
  } catch {
    console.error(
      `no bridge on port ${port}, start one with \`agent-bridge serve\``,
    );
    process.exitCode = 1;
  }
}

function sendEvent(
  response: http.ServerResponse,
  event: string,
  data: unknown,
) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sendJson(
  response: http.ServerResponse,
  status: number,
  data: unknown,
) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(data));
}

async function readBody(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function readStdin(): Promise<string> {
  return readBody(process.stdin);
}
