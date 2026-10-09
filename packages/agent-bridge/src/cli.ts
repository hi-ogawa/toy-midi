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
import { parseArgs } from "node:util";
import * as srvx from "srvx";
import type {
  BridgeResult,
  CallRequest,
  CallResponse,
  PageEvents,
  PageInfo,
  PageResult,
  PageRpc,
  PageRpcResult,
  ToolInfo,
  ToolsResponse,
} from "./protocol.ts";

const DEFAULT_PORT = 4747;
const REQUEST_TIMEOUT_MS = 30_000;
const PING_INTERVAL_MS = 15_000;

const USAGE = `\
usage: agent-bridge <command> [options]

commands:
  serve               run the bridge
  tools               describe the connected page's tools
  call <tool> [json]  call a tool with the JSON input, default {}.
                      A string value is printed as is, and anything else
                      as JSON.
  pages               list connected pages

options:
  --port <number>     bridge port (default ${DEFAULT_PORT}, serve accepts 0
                      for any free port)
  --origin <origin>   page origin to accept, repeatable (serve only, required)
  --page <id>         target page (default the latest connected)
  --arg <key=value>   set a string field of the call input, repeatable.
                      A value of - reads stdin, so code or long text needs no
                      JSON escaping.
  -h, --help          show this help

Before calling tools, read what the page exposes with \`agent-bridge tools\`.`;

/** `PageRpc` as the bridge calls it, with each result wrapped for failures. */
type PageRpcClient = {
  [K in keyof PageRpc]: (
    ...args: Parameters<PageRpc[K]>
  ) => Promise<PageRpcResult<K>>;
};

interface Page extends PageInfo {
  send: <K extends keyof PageEvents>(event: K, data: PageEvents[K]) => void;
}

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
      await serve({ port, origins: values.origin });
      break;
    }
    case "tools": {
      const tools = await requestPage<ToolsResponse>({
        port,
        page: values.page,
        path: "/tools",
      });
      if (tools) {
        console.log(formatTools(tools));
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
      const result = await requestPage<CallResponse>({
        port,
        page: values.page,
        path: "/call",
        init: {
          method: "POST",
          body: JSON.stringify({ name, input } satisfies CallRequest),
        },
      });
      if (!result) {
        return;
      }
      if (result.isError) {
        console.error(result.error);
        process.exitCode = 1;
      } else if (typeof result.value === "string") {
        console.log(result.value);
      } else if (result.value !== undefined) {
        console.log(JSON.stringify(result.value, null, 2));
      }
      break;
    }
    case "pages": {
      const response = await requestBridge({ port, path: "/pages" });
      if (response) {
        const pages = (await response.json()) as PageInfo[];
        console.log(JSON.stringify(pages, null, 2));
      }
      break;
    }
    default: {
      console.error(USAGE);
      process.exitCode = 1;
    }
  }
}

async function serve({ port, origins }: { port: number; origins: string[] }) {
  const pages = new Map<string, Page>();
  const pending = new Map<string, (result: BridgeResult) => void>();

  // Responds with the result of a `PageRpc` call on the chosen page, by
  // default the most recently connected one.
  async function callPage(
    pageId: string | null,
    call: (rpc: PageRpcClient) => Promise<BridgeResult>,
  ): Promise<Response> {
    const page = pages.get(pageId ?? [...pages.keys()].at(-1) ?? "");
    if (!page) {
      return Response.json(
        { ok: false, error: "no page connected" } satisfies BridgeResult,
        { status: 503 },
      );
    }
    const result = await call(createPageRpcClient(page));
    return Response.json(result, { status: result.ok ? 200 : 500 });
  }

  // Calls `PageRpc` methods over the page's event stream. Each call resolves
  // once the page posts its result back, or fails after a timeout.
  function createPageRpcClient(page: Page): PageRpcClient {
    return new Proxy({} as PageRpcClient, {
      get:
        (_, method) =>
        async (...args: unknown[]): Promise<BridgeResult> => {
          const requestId = randomUUID();
          try {
            return await new Promise((resolve) => {
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
              page.send("request", {
                requestId,
                method: method as keyof PageRpc,
                args,
              });
            });
          } finally {
            pending.delete(requestId);
          }
        },
    });
  }

  function connect(url: URL, origin: string): Response {
    let ping: ReturnType<typeof setInterval>;
    const page: Page = {
      id: randomUUID().slice(0, 8),
      origin,
      url: url.searchParams.get("url") ?? undefined,
      connectedAt: new Date().toISOString(),
      send: () => {},
    };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        page.send = (event, data) =>
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        ping = setInterval(
          () => controller.enqueue(encoder.encode(": ping\n\n")),
          PING_INTERVAL_MS,
        );
        pages.set(page.id, page);
        page.send("hello", { pageId: page.id });
        console.log(
          `[agent-bridge] page ${page.id} connected from ${page.url ?? origin}`,
        );
      },
      // The server cancels the body when the page's connection closes.
      cancel() {
        clearInterval(ping);
        pages.delete(page.id);
        console.log(`[agent-bridge] page ${page.id} disconnected`);
      },
    });
    return new Response(body, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      },
    });
  }

  async function handlePage(
    request: Request,
    url: URL,
    origin: string,
  ): Promise<Response> {
    switch (`${request.method} ${url.pathname}`) {
      case "OPTIONS /connect":
      case "OPTIONS /result": {
        return new Response(undefined, {
          status: 204,
          headers: {
            "access-control-allow-methods": "GET, POST",
            "access-control-allow-headers": "content-type",
            "access-control-allow-private-network": "true",
          },
        });
      }
      case "GET /connect": {
        return connect(url, origin);
      }
      case "POST /result": {
        const { requestId, ...result } = (await request.json()) as PageResult;
        pending.get(requestId)?.(result);
        return new Response(undefined, { status: 204 });
      }
      default: {
        return new Response("not found\n", { status: 404 });
      }
    }
  }

  async function handleAgent(request: Request, url: URL): Promise<Response> {
    const pageId = url.searchParams.get("page");
    switch (`${request.method} ${url.pathname}`) {
      case "GET /pages": {
        return Response.json(
          [...pages.values()].map(
            ({ id, origin, url, connectedAt }): PageInfo => ({
              id,
              origin,
              url,
              connectedAt,
            }),
          ),
        );
      }
      case "GET /tools": {
        return callPage(pageId, (rpc) => rpc.getTools());
      }
      case "POST /call": {
        const { name, input } = (await request.json()) as CallRequest;
        return callPage(pageId, (rpc) => rpc.executeTool({ name }, input));
      }
      default: {
        return new Response("not found\n", { status: 404 });
      }
    }
  }

  const server = srvx.serve({
    hostname: "127.0.0.1",
    port,
    silent: true,
    fetch: async (request) => {
      // Only answer requests addressed to the loopback host, so a site that
      // rebinds its DNS to 127.0.0.1 cannot reach the bridge as same-origin.
      if (!isLocalHost(request.headers.get("host"))) {
        return new Response("host not allowed\n", { status: 403 });
      }
      const url = new URL(request.url);
      const origin = request.headers.get("origin");
      // Requests from pages carry an Origin, and only listed origins may
      // connect. Agent requests come from a shell, so any request with an
      // Origin is rejected there, which keeps other sites from driving the
      // page.
      if (
        url.pathname === "/connect" ||
        url.pathname === "/result" ||
        request.method === "OPTIONS"
      ) {
        if (!origin || !origins.includes(origin)) {
          return new Response("origin not allowed\n", { status: 403 });
        }
        const response = await handlePage(request, url, origin);
        response.headers.set("access-control-allow-origin", origin);
        return response;
      }
      if (origin) {
        return new Response(
          "agent endpoints do not accept browser requests\n",
          {
            status: 403,
          },
        );
      }
      return handleAgent(request, url);
    },
  });
  await server.ready();
  console.log(`[agent-bridge] listening on ${server.url}`);
  console.log(`[agent-bridge] accepting pages from ${origins.join(", ")}`);
}

function isLocalHost(host: string | null) {
  const name = host?.replace(/:\d+$/, "");
  return name === "localhost" || name === "127.0.0.1";
}

// Requests a page through the bridge and returns the result value. Failures
// are printed to stderr with exit code 1 and return undefined.
async function requestPage<T extends BridgeResult>({
  port,
  page,
  path,
  init,
}: {
  port: number;
  page?: string;
  path: string;
  init?: RequestInit;
}): Promise<Extract<T, { ok: true }>["value"]> {
  const response = await requestBridge({
    port,
    path: page ? `${path}?page=${encodeURIComponent(page)}` : path,
    init,
  });
  if (!response) {
    return;
  }
  const result = (await response.json()) as T;
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

async function readBody(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
