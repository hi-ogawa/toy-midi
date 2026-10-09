import { spawn } from "node:child_process";
import { once } from "node:events";
import { test as base } from "@playwright/test";

/** Playwright `test` with a `bridge` fixture, which runs an agent bridge that accepts the app's origin. */
export const test = base.extend<{ bridge: AgentBridge }>({
  bridge: async ({ baseURL }, use) => {
    const server = spawn(process.execPath, [
      CLI_PATH,
      "serve",
      "--port",
      "0",
      "--origin",
      new URL(baseURL!).origin,
    ]);
    const [listening] = await Promise.race([
      once(server.stdout, "data"),
      once(server, "exit").then(() => {
        throw new Error("agent bridge exited before listening");
      }),
    ]);
    const port = Number(String(listening).match(/listening on .*:(\d+)/)![1]);
    await use({
      port,
      run: (args, stdin) => runCli([...args, "--port", String(port)], stdin),
    });
    server.kill();
  },
});

const CLI_PATH = "packages/agent-bridge/bin/cli.js";

interface AgentBridge {
  port: number;
  run: (args: string[], stdin?: string) => Promise<CliResult>;
}

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[], stdin?: string): Promise<CliResult> {
  const child = spawn(process.execPath, [CLI_PATH, ...args]);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  child.stdin.end(stdin);
  const [code] = await once(child, "close");
  return { code, stdout, stderr };
}
