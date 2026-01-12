import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "VITE_AUTO_SAVE_DEBOUNCE_MS=50 pnpm dev --port 5183",
    url: "http://localhost:5183",
    reuseExistingServer: false,
  },
  use: {
    baseURL: "http://localhost:5183",
  },
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--autoplay-policy=no-user-gesture-required"],
        },
      },
    },
  ],
});
