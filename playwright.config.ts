import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "pnpm dev --port 5183",
    url: "http://localhost:5183",
    reuseExistingServer: false,
    env: {
      VITE_AUTO_SAVE_DEBOUNCE_MS: "50",
      ...(process.env.CI ? { VITE_FAKE_BASIC_PITCH: "true" } : {}),
    },
  },
  use: {
    baseURL: "http://localhost:5183",
  },
  forbidOnly: !!process.env.CI,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/report.json" }],
    ...(process.env.CI ? [["github"] as const] : []),
  ],
  projects: [
    {
      name: "chromium",
      testIgnore: "latency-checker.spec.ts",
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
      testMatch: "latency-checker.spec.ts",
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
