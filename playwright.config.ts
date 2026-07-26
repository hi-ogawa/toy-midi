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
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
        launchOptions: {
          args: [
            "--autoplay-policy=no-user-gesture-required",
            ...(process.env.CI
              ? [
                  "--use-gl=angle",
                  "--use-angle=swiftshader",
                  "--enable-unsafe-swiftshader",
                ]
              : []),
          ],
        },
      },
    },
  ],
});
