import { spawn } from "node:child_process";
import { once } from "node:events";
import { test as base } from "@playwright/test";

/**
 * Playwright `test` with a `bridge` fixture, which runs a webmcp-bridge that
 * accepts the app's origin unless `allowAppOrigin` is false. Each test gets
 * its own config directory, so the user's saved origins never apply.
 */
export const test = base.extend<{
  allowAppOrigin: boolean;
  bridge: BridgeFixture;
}>({
  allowAppOrigin: [true, { option: true }],
  bridge: async ({ baseURL, allowAppOrigin }, use, testInfo) => {
    const env = {
      ...process.env,
      XDG_CONFIG_HOME: testInfo.outputPath("config"),
    };
    const origin = new URL(baseURL!).origin;
    const server = spawn(
      process.execPath,
      [
        CLI_PATH,
        "serve",
        "--port",
        "0",
        ...(allowAppOrigin ? ["--origin", origin] : []),
      ],
      { env },
    );
    const [listening] = await Promise.race([
      once(server.stdout, "data"),
      once(server, "exit").then(() => {
        throw new Error("webmcp-bridge exited before listening");
      }),
    ]);
    const port = Number(String(listening).match(/listening on .*:(\d+)/)![1]);
    await use({
      port,
      run: (args, stdin) =>
        runCli([...args, "--port", String(port)], { env, stdin }),
    });
    server.kill();
  },
});

const CLI_PATH = "packages/webmcp-bridge/bin/cli.js";

interface BridgeFixture {
  port: number;
  run: (args: string[], stdin?: string) => Promise<CliResult>;
}

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

async function runCli(
  args: string[],
  { env, stdin }: { env: NodeJS.ProcessEnv; stdin?: string },
): Promise<CliResult> {
  const child = spawn(process.execPath, [CLI_PATH, ...args], { env });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  child.stdin.end(stdin);
  const [code] = await once(child, "close");
  return { code, stdout, stderr };
}
