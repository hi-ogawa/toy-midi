import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "pnpm dev --port 5183",
    url: "http://localhost:5183",
    reuseExistingServer: false,
    env: {
      VITE_AUTO_SAVE_DEBOUNCE_MS: "50",
    },
  },
  use: {
    baseURL: "http://localhost:5183",
    trace: "retain-on-failure",
  },
  forbidOnly: !!process.env.CI,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/report.json" }],
    ["@hiogawa/playwright-trace-pack/reporter"],
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
