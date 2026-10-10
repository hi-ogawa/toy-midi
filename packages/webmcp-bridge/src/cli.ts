import { parseArgs } from "node:util";
import { addConfigOrigin, getConfigPath, readConfigOrigins } from "./config.ts";
import {
  AGENT_ENDPOINTS,
  DEFAULT_BRIDGE_PORT,
  type PageInfo,
  type PageRpc,
  type ToolInfo,
} from "./protocol.ts";
import type { RpcCall, RpcResult } from "./rpc.ts";
import { BridgeServer } from "./server.ts";

const USAGE = `\
usage: webmcp-bridge <command> [options]

commands:
  serve                       run the bridge
  allow <origin>              let pages from a site connect, saved to
                              ${getConfigPath()}
  get-tools                   describe the connected page's tools
  execute-tool <tool> [json]  execute a tool with the JSON input, default {}.
                              A string value is printed as is, and anything
                              else as JSON.
  pages                       list connected pages

options:
  --port <number>     bridge port (default ${DEFAULT_BRIDGE_PORT}, serve accepts 0
                      for any free port)
  --origin <origin>   page origin to accept besides the saved ones,
                      repeatable (serve only)
  --page <id>         target page, required when several pages are connected
  --arg <key=value>   set a string field of the tool input, repeatable.
                      A value of - reads stdin, so code or long text needs no
                      JSON escaping.
  -h, --help          show this help

Before executing tools, read what the page exposes with
\`webmcp-bridge get-tools\`.`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: "string", default: String(DEFAULT_BRIDGE_PORT) },
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
      const origins = values.origin ?? [];
      await new BridgeServer({
        getOrigins: () => [...origins, ...readConfigOrigins()],
      }).listen(port);
      console.log(
        `[webmcp-bridge] accepting pages from ${[...origins, getConfigPath()].join(", ")}`,
      );
      break;
    }
    case "allow": {
      const [origin] = rest;
      if (
        !origin ||
        !URL.canParse(origin) ||
        new URL(origin).origin !== origin
      ) {
        throw new Error(
          "allow requires an origin, such as https://example.com",
        );
      }
      addConfigOrigin(origin);
      console.log(`allowed ${origin} in ${getConfigPath()}`);
      break;
    }
    case "get-tools": {
      const rpc = createPageRpcClient({ port, page: values.page });
      console.log(formatTools(await rpc.getTools()));
      break;
    }
    case "execute-tool": {
      const [name, json] = rest;
      if (!name) {
        throw new Error(USAGE);
      }
      const input = {
        ...(json ? JSON.parse(json) : {}),
        ...(await parseArgInputs(values.arg ?? [])),
      };
      const rpc = createPageRpcClient({ port, page: values.page });
      const result = await rpc.executeTool({ name }, input);
      if (result.isError) {
        throw new Error(result.error);
      } else if (typeof result.value === "string") {
        console.log(result.value);
      } else if (result.value !== undefined) {
        console.log(JSON.stringify(result.value, null, 2));
      }
      break;
    }
    case "pages": {
      const response = await requestBridge({
        port,
        path: AGENT_ENDPOINTS.pages,
      });
      const pages = (await response.json()) as PageInfo[];
      console.log(JSON.stringify(pages, null, 2));
      break;
    }
    default: {
      throw new Error(USAGE);
    }
  }
}

type PageRpcClient = {
  [K in keyof PageRpc]: (
    ...args: Parameters<PageRpc[K]>
  ) => Promise<Awaited<ReturnType<PageRpc[K]>>>;
};

// A failed call, such as one with no page connected, throws the bridge's
// error.
function createPageRpcClient({
  port,
  page,
}: {
  port: number;
  page?: string;
}): PageRpcClient {
  const path = page
    ? `${AGENT_ENDPOINTS.rpc}?page=${encodeURIComponent(page)}`
    : AGENT_ENDPOINTS.rpc;
  return new Proxy({} as PageRpcClient, {
    get:
      (_, method) =>
      async (...args: unknown[]) => {
        const call: RpcCall = { method: method as string, args };
        const response = await requestBridge({
          port,
          path,
          init: { method: "POST", body: JSON.stringify(call) },
        });
        const result = (await response.json()) as RpcResult;
        if (!result.ok) {
          throw new Error(result.error);
        }
        return result.value;
      },
  });
}

async function requestBridge({
  port,
  path,
  init,
}: {
  port: number;
  path: string;
  init?: RequestInit;
}): Promise<Response> {
  try {
    return await fetch(`http://127.0.0.1:${port}${path}`, init);
  } catch {
    throw new Error(
      `no bridge on port ${port}, start one with \`webmcp-bridge serve\``,
    );
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
    input[arg.slice(0, separator)] = value === "-" ? await readStdin() : value;
  }
  return input;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

main().catch((error: unknown) => {
  // Errors carry user-facing messages, such as malformed input, so skip
  // stack traces.
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
