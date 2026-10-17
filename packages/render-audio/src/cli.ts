import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parseArgs, styleText } from "node:util";
import { chromium } from "playwright-core";

// Render a project archive to WAV through the real app's Export Audio, so the
// file matches what the app exports.

const DEFAULT_URL = "https://toy-midi.hiro18181.workers.dev";

const USAGE =
  "Usage: toy-midi-render-audio <project.toymidi.zip> <output.wav> [--url URL]";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const options = parseCliOptions(args);
  const startedAt = performance.now();
  writeLine(style("bold", "render-audio"));
  for (const [label, value] of [
    ["input", options.input],
    ["output", style("cyan", options.output)],
    ["app", options.url],
  ]) {
    writeLine(`  ${style("dim", label.padEnd(6))}  ${value}`);
  }
  writeLine("");

  const archive = await readFile(options.input);
  await using browser = await launchBrowser();
  const page = await browser.newPage();
  const url = new URL("/render-capture", options.url).href;
  await page.goto(url);
  // The deployed app may predate the capture page, so fail with a clear message.
  try {
    await page.waitForFunction(() => window.__toyMidiRenderCapture, undefined, {
      timeout: 10_000,
    });
  } catch {
    throw new Error(
      `No render capture page found at ${url}. The app may predate it.`,
    );
  }
  // Pass the archive in as a response and the WAV out as a download, because
  // both move bytes several times faster than a base64 string through evaluate.
  const archiveUrl = new URL("/render-capture/archive", options.url).href;
  await page.route(archiveUrl, (route) => route.fulfill({ body: archive }));
  const [download, { midiTrackCount }] = await Promise.all([
    page.waitForEvent("download"),
    page.evaluate(
      (src) => window.__toyMidiRenderCapture!.renderArchive(src),
      archiveUrl,
    ),
  ]);
  await download.saveAs(options.output);
  writeLine(
    `${style("green", "✓")} wrote ${style("cyan", options.output)}  ${style("dim", formatDuration(performance.now() - startedAt))}`,
  );
  if (midiTrackCount > 0) {
    writeLine(
      style(
        "yellow",
        `! left out ${midiTrackCount} MIDI track${midiTrackCount === 1 ? "" : "s"}, because Export Audio renders audio tracks only`,
      ),
    );
  }
}

async function launchBrowser() {
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

function parseCliOptions(args: string[]) {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      url: { type: "string", default: DEFAULT_URL },
    },
  });
  const [input, output] = positionals;
  if (!input || !output || positionals.length > 2) {
    throw new Error(USAGE);
  }
  return { input, output, url: values.url };
}

function style(format: Parameters<typeof styleText>[0], text: string) {
  return styleText(format, text, { stream: process.stderr });
}

function writeLine(text: string) {
  process.stderr.write(`${text}\n`);
}

function formatDuration(ms: number) {
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}m${String(whole % 60).padStart(2, "0")}s`;
}

main().catch((error) => {
  // Errors carry user-facing messages, so skip stack traces.
  console.error(
    style("red", error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 1;
});
