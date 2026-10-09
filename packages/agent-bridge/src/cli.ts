// Local bridge between an open web app and an agent with a shell.
//
// A page connects to the bridge with Server-Sent Events, exposing tools in
// the WebMCP shape through the client in client.ts. The agent lists and calls
// those tools through the CLI, the bridge forwards each request to the page,
// and the page's result becomes the response.
//
// Usage:
//   agent-bridge serve --origin https://example.com
//   agent-bridge tools
//   agent-bridge call some_tool '{"key":"value"}'
//   echo 'multi-line text' | agent-bridge call some_tool --arg key=-
//   agent-bridge pages

import { randomUUID } from "node:crypto";
import http from "node:http";
import { parseArgs } from "node:util";
import type { AgentBridgeRequest } from "./client.ts";

const DEFAULT_PORT = 4747;
const REQUEST_TIMEOUT_MS = 30_000;
const PING_INTERVAL_MS = 15_000;

const USAGE = `\
usage: agent-bridge <command> [options]

commands:
  serve               run the bridge
  tools               describe the connected page's tools
  call <tool> [json]  call a tool with the JSON input, default {}.
                      A string result is printed as is, and anything else
                      as JSON.
  pages               list connected pages

options:
  --port <number>     bridge port (default ${DEFAULT_PORT})
  --origin <origin>   page origin to accept, repeatable (serve only, required)
  --page <id>         target page (default the latest connected)
  --arg <key=value>   set a string field of the call input, repeatable.
                      A value of - reads stdin, so code or long text needs no
                      JSON escaping.
  -h, --help          show this help

Before calling tools, read what the page exposes with \`agent-bridge tools\`.`;

interface Page {
  id: string;
  origin: string;
  url?: string;
  connectedAt: string;
  response: http.ServerResponse;
}

type BridgeResult =
  | { ok: true; value?: unknown }
  | { ok: false; error: string };

await main();

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: "string", default: String(DEFAULT_PORT) },
      origin: { type: "string", multiple: true },
      page: { type: "string" },
      arg: { type: "string", multiple: true },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, ...rest] = positionals;
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
    case "tools": {
      const tools = await requestPage({
        port,
        page: values.page,
        path: "/tools",
      });
      if (tools) {
        console.log(formatTools(tools as ToolInfo[]));
      }
      break;
    }
    case "call": {
      const [name, json] = rest;
      if (!name) {
        console.error(USAGE);
        process.exitCode = 1;
        return;
      }
      const input = {
        ...(json ? JSON.parse(json) : {}),
        ...(await parseArgInputs(values.arg ?? [])),
      };
      const value = await requestPage({
        port,
        page: values.page,
        path: "/call",
        init: { method: "POST", body: JSON.stringify({ name, input }) },
      });
      if (typeof value === "string") {
        console.log(value);
      } else if (value !== undefined) {
        console.log(JSON.stringify(value, null, 2));
      }
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
  const pending = new Map<string, (result: BridgeResult) => void>();

  // Sends a request to a page and waits for the result it posts back.
  async function forward(
    response: http.ServerResponse,
    pageId: string | null,
    request: AgentBridgeRequest,
  ) {
    const page = pages.get(pageId ?? [...pages.keys()].at(-1) ?? "");
    if (!page) {
      sendJson(response, 503, { ok: false, error: "no page connected" });
      return;
    }
    const requestId = randomUUID();
    const result = await new Promise<BridgeResult>((resolve) => {
      const timer = setTimeout(
        () =>
          resolve({
            ok: false,
            error: `timed out after ${REQUEST_TIMEOUT_MS} ms`,
          }),
        REQUEST_TIMEOUT_MS,
      );
      pending.set(requestId, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      sendEvent(page.response, "request", { requestId, ...request });
    }).finally(() => pending.delete(requestId));
    sendJson(response, result.ok ? 200 : 500, result);
  }

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
      case "GET /tools": {
        await forward(response, url.searchParams.get("page"), {
          method: "list",
        });
        return;
      }
      case "POST /call": {
        const { name, input } = JSON.parse(await readBody(request));
        await forward(response, url.searchParams.get("page"), {
          method: "call",
          name,
          input,
        });
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

// Requests a page through the bridge and returns the result value. Failures
// are printed to stderr with exit code 1 and return undefined.
async function requestPage({
  port,
  page,
  path,
  init,
}: {
  port: number;
  page?: string;
  path: string;
  init?: RequestInit;
}): Promise<unknown> {
  const response = await requestBridge({
    port,
    path: page ? `${path}?page=${encodeURIComponent(page)}` : path,
    init,
  });
  if (!response) {
    return;
  }
  const result = (await response.json()) as BridgeResult;
  if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
    return;
  }
  return result.value;
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

interface ToolInfo {
  name: string;
  description: string;
  inputSchema: object;
}

// Plain text rather than JSON, so multi-line descriptions read as written.
function formatTools(tools: ToolInfo[]) {
  return tools
    .map(
      (tool) =>
        `# ${tool.name}\n\n${tool.description.trim()}\n\n## Input schema\n\n${JSON.stringify(tool.inputSchema, null, 2)}\n`,
    )
    .join("\n");
}

async function parseArgInputs(args: string[]) {
  const input: Record<string, string> = {};
  for (const arg of args) {
    const separator = arg.indexOf("=");
    if (separator < 0) {
      throw new Error(`--arg expects key=value, got ${arg}`);
    }
    const value = arg.slice(separator + 1);
    input[arg.slice(0, separator)] =
      value === "-" ? await readBody(process.stdin) : value;
  }
  return input;
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
