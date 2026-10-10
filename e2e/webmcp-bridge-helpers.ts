import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { chromium, expect, test as base, type Page } from "@playwright/test";

/** Playwright `test` with a `bridge` fixture, which runs a webmcp-bridge that accepts the app's origin. */
export const test = base.extend<{
  allowAppOrigin: boolean;
  bridge: BridgeFixture;
}>({
  allowAppOrigin: [true, { option: true }],
  bridge: async ({ baseURL, allowAppOrigin }, use, testInfo) => {
    const env = {
      ...process.env,
      // Keep the user's saved origins out of the test.
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

/**
 * `test` whose browser has the webmcp-bridge extension, connecting to the
 * bridge's port, with an `extension` fixture that turns a page's tab on or off
 * as the extension's button would, and reads the tab's badge.
 */
export const extensionTest = test.extend<{ extension: ExtensionFixture }>({
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
    // Build the extension.
    const extensionPath = testInfo.outputPath("extension");
    await execFileAsync("pnpm", [
      "-C",
      PACKAGE_PATH,
      "build-extension",
      "--outDir",
      extensionPath,
    ]);
    // Allow the app's site up front, as clicking the extension's button would.
    const manifestPath = path.join(extensionPath, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.host_permissions = [`http://${new URL(baseURL!).hostname}/*`];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    // Load it into a persistent context, the only kind that loads extensions.
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
    // Wait for the background worker to register the scripts for the site.
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    await expect
      .poll(() =>
        worker.evaluate(
          "chrome.scripting.getRegisteredContentScripts().then((scripts) => scripts.length)",
        ),
      )
      .toBe(2);
    // Point the extension at the bridge's port.
    await worker.evaluate(
      (port) => (globalThis as any).__e2e.setBridgePort(port),
      bridge.port,
    );
    await use(context);
    await context.close();
  },
  page: async ({ context }, use) => {
    await use(context.pages()[0] ?? (await context.newPage()));
  },
  extension: async ({ context }, use) => {
    const [worker] = context.serviceWorkers();
    const callOnTab = async (
      page: Page,
      method: string,
      ...args: unknown[]
    ) => {
      await page.bringToFront();
      return await worker!.evaluate(
        async ([method, args]) => {
          const { chrome, __e2e } = globalThis as any;
          const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          return await __e2e[method](tab.id, ...args);
        },
        [method, args] as const,
      );
    };
    await use({
      toggleTab: async (page) => {
        await callOnTab(page, "toggleTab", new URL(page.url()).origin);
      },
      getBadgeText: async (page) =>
        (await callOnTab(page, "getBadgeText")) as string,
    });
  },
});

const execFileAsync = promisify(execFile);

const PACKAGE_PATH = "packages/webmcp-bridge";
const CLI_PATH = `${PACKAGE_PATH}/bin/cli.js`;

interface ExtensionFixture {
  toggleTab: (page: Page) => Promise<void>;
  getBadgeText: (page: Page) => Promise<string>;
}

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
