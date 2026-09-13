import net from "node:net";
import type { TracePackReporterOptions } from "@hiogawa/playwright-trace-pack/reporter";
import { defineConfig, devices } from "@playwright/test";

// Resolve the port once and share it with Playwright workers.
const port = process.env.E2E_PORT
  ? Number(process.env.E2E_PORT)
  : await getFreePort(5183);
process.env.E2E_PORT = String(port);

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: `pnpm dev --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    env: {
      VITE_AUTO_SAVE_DEBOUNCE_MS: "50",
    },
  },
  use: {
    baseURL: `http://localhost:${port}`,
    trace:
      process.env.E2E_TRACE === "1"
        ? { mode: "on", screenshots: false }
        : "off",
  },
  forbidOnly: !!process.env.CI,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/report.json" }],
    [
      "@hiogawa/playwright-trace-pack/reporter",
      {
        excludeResponseBody: ({ url }) =>
          new URL(url).pathname.endsWith(".sf2"),
      } satisfies TracePackReporterOptions,
    ],
    ...(process.env.CI ? [["github"] as const] : []),
  ],
  projects: [
    {
      name: "chromium",
      testIgnore: "fake-audio/**/*.test.ts",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
        launchOptions: {
          args: ["--autoplay-policy=no-user-gesture-required"],
        },
      },
    },
    {
      name: "chromium-fake-audio",
      testMatch: "fake-audio/**/*.test.ts",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
        permissions: ["microphone"],
        launchOptions: {
          args: [
            "--autoplay-policy=no-user-gesture-required",
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
          ],
        },
      },
    },
  ],
});

function getFreePort(preferred: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE" && preferred !== 0) {
        resolve(getFreePort(0));
      } else {
        reject(error);
      }
    });
    server.listen(preferred, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve(port);
        }
      });
    });
  });
}
