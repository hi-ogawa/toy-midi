import { createRequire } from "node:module";
import { type Browser, chromium, type ViewportSize } from "playwright-core";
import type { CliApi } from "../../../src/lib/cli-api";

export const DEFAULT_URL = "https://toy-midi.hiro18181.workers.dev";

export async function launchBrowser() {
  try {
    // Use full Chromium in headless mode, matching the e2e setup, so a single
    // `install chromium --no-shell` covers both.
    return await chromium.launch({ channel: "chromium" });
  } catch (error) {
    const { version } = createRequire(import.meta.url)(
      "playwright-core/package.json",
    );
    throw new Error(
      `Failed to launch Chromium. Install it with:\n\n  npx playwright-core@${version} install chromium --no-shell\n`,
      { cause: error },
    );
  }
}

// Open a bare page of the app and wait until it exposes its CLI API entry.
export async function openCliPage({
  browser,
  url,
  pathname,
  api,
  viewport,
}: {
  browser: Browser;
  url: string;
  pathname: string;
  api: keyof CliApi;
  viewport?: ViewportSize;
}) {
  const page = await browser.newPage({ viewport });
  const pageUrl = new URL(pathname, url).href;
  await page.goto(pageUrl);
  // The deployed app may predate the page, so fail with a clear message.
  try {
    await page.waitForFunction((api) => window.__toyMidiCli?.[api], api, {
      timeout: 10_000,
    });
  } catch {
    throw new Error(
      `No ${pathname} page found at ${url}. The app may predate it.`,
    );
  }
  return page;
}
