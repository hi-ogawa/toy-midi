import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, expect, test as base } from "@playwright/test";

/** Playwright `test` with a `bridge` fixture, which runs a webmcp-bridge that accepts the app's origin. */
export const test = base.extend<{ bridge: BridgeFixture }>({
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
        throw new Error("webmcp-bridge exited before listening");
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

/** `test` whose browser has the webmcp-bridge extension, built for the bridge's port. */
export const extensionTest = test.extend({
  // Build the extension for the bridge's port, allow the app's site as clicking
  // the extension's button would, and load it into a persistent context, the
  // only kind that loads extensions.
  context: async (
    {
      channel,
      launchOptions,
      contextOptions,
      viewport,
      userAgent,
      deviceScaleFactor,
      baseURL,
      bridge,
    },
    use,
    testInfo,
  ) => {
    const extensionPath = testInfo.outputPath("extension");
    execFileSync(
      "pnpm",
      ["-C", PACKAGE_PATH, "build-extension", "--outDir", extensionPath],
      {
        env: { ...process.env, WEBMCP_BRIDGE_PORT: String(bridge.port) },
        stdio: "pipe",
      },
    );
    const manifestPath = path.join(extensionPath, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.host_permissions = [`http://${new URL(baseURL!).hostname}/*`];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const context = await chromium.launchPersistentContext("", {
      ...launchOptions,
      ...contextOptions,
      channel,
      viewport,
      userAgent,
      deviceScaleFactor,
      baseURL,
      args: [
        ...(launchOptions.args ?? []),
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    await expect
      .poll(() =>
        worker.evaluate(
          "chrome.scripting.getRegisteredContentScripts().then((scripts) => scripts.length)",
        ),
      )
      .toBe(1);
    await use(context);
    await context.close();
  },
  page: async ({ context }, use) => {
    await use(context.pages()[0] ?? (await context.newPage()));
  },
});

const PACKAGE_PATH = "packages/webmcp-bridge";
const CLI_PATH = `${PACKAGE_PATH}/bin/cli.js`;

interface BridgeFixture {
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
