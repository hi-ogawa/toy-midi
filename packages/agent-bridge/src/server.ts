// Local bridge between an open web app and an agent with a shell.
//
// A page connects with Server-Sent Events and exposes tools through the
// client in client.ts. The agent posts `PageRpc` calls, the bridge forwards
// each one to the page, and the result the page posts back becomes the
// response.

import { randomUUID } from "node:crypto";
import * as srvx from "srvx";
import {
  AGENT_ENDPOINTS,
  PAGE_ENDPOINTS,
  PAGE_EVENTS,
  type PageEvents,
  type PageInfo,
} from "./protocol.ts";
import type { RpcCall, RpcResponse, RpcResult } from "./rpc.ts";

const REQUEST_TIMEOUT_MS = 30_000;
const PING_INTERVAL_MS = 15_000;

export async function serveBridge({
  port,
  origins,
}: {
  port: number;
  origins: string[];
}) {
  const pages = new Map<string, PageConnection>();
  const pending = new Map<string, (result: RpcResult) => void>();

  // Forwards a `PageRpc` call to the chosen page, by default the most
  // recently connected one, and responds with the result it posts back.
  async function callPage(
    pageId: string | undefined,
    call: RpcCall,
  ): Promise<Response> {
    const page = pageId ? pages.get(pageId) : [...pages.values()].at(-1);
    if (!page) {
      return Response.json(
        { ok: false, error: "no page connected" } satisfies RpcResult,
        { status: 503 },
      );
    }
    const result = await sendRequest(page, call);
    return Response.json(result, { status: result.ok ? 200 : 500 });
  }

  // Sends a call over the page's event stream, and resolves once the page
  // posts its result back, or fails after a timeout.
  async function sendRequest(
    page: PageConnection,
    call: RpcCall,
  ): Promise<RpcResult> {
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
        page.send(PAGE_EVENTS.request, { requestId, ...call });
      });
    } finally {
      pending.delete(requestId);
    }
  }

  function connect(url: URL, origin: string): Response {
    let ping: ReturnType<typeof setInterval>;
    const page: PageConnection = {
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
        // The response headers go out with the first bytes, so write a
        // comment for the page's EventSource to open right away.
        controller.enqueue(encoder.encode(": connected\n\n"));
        ping = setInterval(
          () => controller.enqueue(encoder.encode(": ping\n\n")),
          PING_INTERVAL_MS,
        );
        pages.set(page.id, page);
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
      case `GET ${PAGE_ENDPOINTS.connect}`: {
        return connect(url, origin);
      }
      case `POST ${PAGE_ENDPOINTS.result}`: {
        const { requestId, ...result } = (await request.json()) as RpcResponse;
        pending.get(requestId)?.(result);
        return new Response(undefined, { status: 204 });
      }
      default: {
        return new Response("not found\n", { status: 404 });
      }
    }
  }

  async function handleAgent(request: Request, url: URL): Promise<Response> {
    const pageId = url.searchParams.get("page") ?? undefined;
    switch (`${request.method} ${url.pathname}`) {
      case `GET ${AGENT_ENDPOINTS.pages}`: {
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
      case `POST ${AGENT_ENDPOINTS.rpc}`: {
        return callPage(pageId, (await request.json()) as RpcCall);
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
        url.pathname === PAGE_ENDPOINTS.connect ||
        url.pathname === PAGE_ENDPOINTS.result
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

/** A connected page: what `GET pages` lists, and the stream that sends it events. */
interface PageConnection extends PageInfo {
  send: <K extends keyof PageEvents>(event: K, data: PageEvents[K]) => void;
}
