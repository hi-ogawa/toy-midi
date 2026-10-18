import { chromium } from "@playwright/test";
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
await page.goto(url);
await page.waitForSelector('[data-testid="midi-overview"]', { timeout: 30000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: out });
await browser.close();
