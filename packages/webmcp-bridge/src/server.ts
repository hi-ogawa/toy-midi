import { randomUUID } from "node:crypto";
import * as srvx from "srvx";
import {
  AGENT_ENDPOINTS,
  AGENT_PREFIX,
  PAGE_ENDPOINTS,
  PAGE_PREFIX,
  PAGE_EVENTS,
  type PageEvents,
  type PageInfo,
} from "./protocol.ts";
import type { RpcCall, RpcResponse, RpcResult } from "./rpc.ts";

const REQUEST_TIMEOUT_MS = 30_000;
const PING_INTERVAL_MS = 15_000;

/**
 * The bridge server. It keeps one event stream per connected page, and relays
 * each agent call to a page and the page's result back to the agent.
 */
export class BridgeServer {
  private readonly getOrigins: () => string[];
  private readonly pages = new Map<string, PageConnection>();
  private readonly pending = new Map<string, (result: RpcResult) => void>();

  // Origins are read for each request, so a newly allowed site connects
  // without a restart.
  constructor({ getOrigins }: { getOrigins: () => string[] }) {
    this.getOrigins = getOrigins;
  }

  async listen(port: number) {
    const server = srvx.serve({
      hostname: "127.0.0.1",
      port,
      silent: true,
      fetch: (request) => this.handle(request),
    });
    await server.ready();
    console.log(`[webmcp-bridge] listening on ${server.url}`);
  }

  async handle(request: Request): Promise<Response> {
    // Only answer requests addressed to the loopback host, so a site that
    // rebinds its DNS to 127.0.0.1 cannot reach the bridge as same-origin.
    const host = request.headers.get("host");
    if (!isLocalHost(host)) {
      return refuse(`a request to host ${host}`, "host not allowed");
    }
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    // Requests from pages carry an Origin, and only listed origins may
    // connect. Agent requests come from a shell, so any request with an
    // Origin is rejected there, which keeps other sites from driving the
    // page.
    if (url.pathname.startsWith(PAGE_PREFIX)) {
      if (!origin) {
        return refuse("a page request without an Origin", "origin not allowed");
      }
      if (!this.getOrigins().includes(origin)) {
        return refuse(
          `a page from ${origin}, allow it with: webmcp-bridge allow ${origin}`,
          "origin not allowed",
        );
      }
      const response = await this.handlePage(request, url, origin);
      response.headers.set("access-control-allow-origin", origin);
      return response;
    }
    if (url.pathname.startsWith(AGENT_PREFIX)) {
      if (origin) {
        return refuse(
          `a browser request from ${origin} to an agent endpoint`,
          "agent endpoints do not accept browser requests",
        );
      }
      return this.handleAgent(request, url);
    }
    return new Response("not found\n", { status: 404 });
  }

  private async handlePage(
    request: Request,
    url: URL,
    origin: string,
  ): Promise<Response> {
    switch (`${request.method} ${url.pathname}`) {
      case `GET ${PAGE_ENDPOINTS.connect}`: {
        return this.connect(url, origin);
      }
      case `POST ${PAGE_ENDPOINTS.result}`: {
        const { requestId, ...result } = (await request.json()) as RpcResponse;
        this.pending.get(requestId)?.(result);
        return new Response(undefined, { status: 204 });
      }
      default: {
        return new Response("not found\n", { status: 404 });
      }
    }
  }

  private connect(url: URL, origin: string): Response {
    let ping: ReturnType<typeof setInterval>;
    const page: PageConnection = {
      id: randomUUID().slice(0, 8),
      origin,
      url: url.searchParams.get("url") ?? undefined,
      connectedAt: new Date().toISOString(),
      send: () => {},
    };
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
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
        this.pages.set(page.id, page);
        console.log(
          `[webmcp-bridge] page ${page.id} connected from ${page.url ?? origin}`,
        );
      },
      // The server cancels the body when the page's connection closes.
      cancel: () => {
        clearInterval(ping);
        this.pages.delete(page.id);
        console.log(`[webmcp-bridge] page ${page.id} disconnected`);
      },
    });
    return new Response(body, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      },
    });
  }

  private async handleAgent(request: Request, url: URL): Promise<Response> {
    switch (`${request.method} ${url.pathname}`) {
      case `GET ${AGENT_ENDPOINTS.pages}`: {
        return Response.json(
          [...this.pages.values()].map(
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
        return this.callPage(
          url.searchParams.get("page") ?? undefined,
          (await request.json()) as RpcCall,
        );
      }
      default: {
        return new Response("not found\n", { status: 404 });
      }
    }
  }

  private async callPage(
    pageId: string | undefined,
    call: RpcCall,
  ): Promise<Response> {
    const choice = this.choosePage(pageId);
    if ("error" in choice) {
      return Response.json(
        { ok: false, error: choice.error } satisfies RpcResult,
        { status: choice.status },
      );
    }
    const result = await this.sendRequest(choice.page, call);
    return Response.json(result, { status: result.ok ? 200 : 500 });
  }

  // Without `pageId`, only a single connected page is chosen, so a call never
  // goes to one of several pages by guess.
  private choosePage(
    pageId: string | undefined,
  ): { page: PageConnection } | { error: string; status: number } {
    if (pageId) {
      const page = this.pages.get(pageId);
      return page
        ? { page }
        : { error: `no page ${pageId} connected`, status: 404 };
    }
    if (this.pages.size === 0) {
      return { error: "no page connected", status: 503 };
    }
    if (this.pages.size > 1) {
      return {
        error: `${this.pages.size} pages connected, choose one with --page <id>: ${[...this.pages.keys()].join(", ")}`,
        status: 409,
      };
    }
    const [page] = this.pages.values();
    return { page: page! };
  }

  // Sends a call over the page's event stream, and resolves once the page
  // posts its result back, or fails after a timeout.
  private async sendRequest(
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
        this.pending.set(requestId, (result) => {
          clearTimeout(timer);
          resolve(result);
        });
        page.send(PAGE_EVENTS.request, { requestId, ...call });
      });
    } finally {
      this.pending.delete(requestId);
    }
  }
}

function refuse(request: string, reason: string) {
  console.log(`[webmcp-bridge] refused ${request}`);
  return new Response(`${reason}\n`, { status: 403 });
}

function isLocalHost(host: string | null) {
  const name = host?.replace(/:\d+$/, "");
  return name === "localhost" || name === "127.0.0.1";
}

/** A connected page: what `GET pages` lists, and the stream that sends it events. */
interface PageConnection extends PageInfo {
  send: <K extends keyof PageEvents>(event: K, data: PageEvents[K]) => void;
}
