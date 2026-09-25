import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { parseArgs } from "node:util";
import { type Browser, chromium } from "playwright-core";

// Render a silent score video by stepping the real score viewer frame by frame
// and screenshotting its score area, so the video matches interactive playback.

const DEFAULT_URL = "https://toy-midi.hiro18181.workers.dev";

const USAGE =
  "Usage: toy-midi-score-video <input.musicxml> <output.mp4> [--fps 30] [--width 1280] [--height 480] [--start 0] [--end SECONDS] [--workers 4] [--url URL]";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const options = parseCliOptions(args);
  const source = {
    name: path.basename(options.input),
    xml: await readFile(options.input, "utf8"),
  };

  if (spawnSync("ffmpeg", ["-version"]).error) {
    throw new Error("ffmpeg is required on PATH to encode the video");
  }

  await using browser = await launchBrowser();
  await renderVideo({ browser, options, source });
}

async function renderVideo({
  browser,
  options,
  source,
}: {
  browser: Browser;
  options: CliOptions;
  source: { name: string; xml: string };
}) {
  const progress = new RenderProgress();
  progress.log(
    `loading ${source.name} in ${options.workers} pages from ${options.url}`,
  );
  const pages = await Promise.all(
    Array.from({ length: options.workers }, () =>
      openScorePage({ browser, options, source }),
    ),
  );
  const { duration } = pages[0];
  const startFrame = Math.floor(options.start * options.fps);
  const endFrame = Math.ceil(
    Math.min(options.end ?? duration, duration) * options.fps,
  );
  if (startFrame >= endFrame) {
    throw new Error(
      `--start must be before the end of the score (${duration.toFixed(1)}s)`,
    );
  }

  // Stream frames to FFmpeg in order while workers capture them out of order.
  // Disposal kills FFmpeg if capture fails, and is a no-op after it exits.
  using ffmpeg = spawn(
    "ffmpeg",
    [
      // Overwrite the output and print only errors.
      ["-y"],
      ["-loglevel", "error"],
      // Read concatenated PNG screenshots from stdin. Images carry no
      // timestamps, so the frame rate sets each image's duration.
      ["-f", "image2pipe"],
      ["-framerate", String(options.fps)],
      ["-c:v", "png"],
      ["-i", "-"],
      // Encode H.264 with 4:2:0 chroma, which players and video editors
      // widely support. This is why frame dimensions must be even.
      ["-c:v", "libx264"],
      ["-pix_fmt", "yuv420p"],
      [options.output],
    ].flat(),
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const exited = new Promise<number | null>((resolve) =>
    ffmpeg.once("close", resolve),
  );
  const frameCount = endFrame - startFrame;
  progress.loaded({ frameCount, fps: options.fps });
  const pending = new Map<number, Buffer>();
  let nextFrame = 0;
  let writing = Promise.resolve();
  function enqueue(frame: number, png: Buffer) {
    pending.set(frame, png);
    writing = writing.then(async () => {
      while (pending.has(nextFrame)) {
        const next = pending.get(nextFrame)!;
        pending.delete(nextFrame);
        nextFrame++;
        if (!ffmpeg.stdin.write(next)) {
          await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve));
        }
        if (nextFrame % options.fps === 0) {
          progress.frame(nextFrame);
        }
      }
    });
  }

  // The viewer's scroll position depends on which systems the cursor has
  // passed through, so each page replays earlier frames without capturing,
  // then captures every Nth frame. This matches sequential playback as long as
  // no system lasts shorter than N frames.
  await Promise.all(
    pages.map(async ({ page, cdp }, worker) => {
      await page.evaluate(
        ({ frames, fps }) => {
          for (let frame = 0; frame < frames; frame++) {
            window.__toyMidiScoreViewer!.seek(frame / fps);
          }
        },
        { frames: startFrame + worker, fps: options.fps },
      );
      for (let frame = worker; frame < frameCount; frame += options.workers) {
        await page.evaluate(
          (seconds) => window.__toyMidiScoreViewer!.seek(seconds),
          (startFrame + frame) / options.fps,
        );
        const { data } = await cdp.send("Page.captureScreenshot", {
          format: "png",
          optimizeForSpeed: true,
        });
        enqueue(frame, Buffer.from(data, "base64"));
      }
    }),
  );
  await writing;
  ffmpeg.stdin.end();
  const exitCode = await exited;
  if (exitCode !== 0) {
    throw new Error(`ffmpeg exited with code ${exitCode}`);
  }
  progress.done(options.output);
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

async function openScorePage({
  browser,
  options,
  source,
}: {
  browser: Browser;
  options: CliOptions;
  source: { name: string; xml: string };
}) {
  // The capture page shows only the score scaled to the viewport width, so the
  // viewport is the video frame.
  const page = await browser.newPage({
    viewport: { width: options.width, height: options.height },
  });
  const url = new URL("/score-capture", options.url).href;
  await page.goto(url);
  // The deployed app may predate the capture page, so fail with a clear message.
  try {
    await page.waitForFunction(() => window.__toyMidiScoreViewer, undefined, {
      timeout: 10_000,
    });
  } catch {
    throw new Error(
      `No score capture page found at ${url}. The app may predate it.`,
    );
  }
  const duration = await page.evaluate(async (score) => {
    const viewer = window.__toyMidiScoreViewer!;
    await viewer.load({ score });
    await document.fonts.ready;
    viewer.setScaleToFitViewport();
    return viewer.getDuration();
  }, source);
  const cdp = await page.context().newCDPSession(page);
  return { page, cdp, duration };
}

type CliOptions = ReturnType<typeof parseCliOptions>;

function parseCliOptions(args: string[]) {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      fps: { type: "string", default: "30" },
      // 720p width with a height that fits two systems of typical bass scores.
      width: { type: "string", default: "1280" },
      height: { type: "string", default: "480" },
      url: { type: "string", default: DEFAULT_URL },
      workers: { type: "string", default: "4" },
      start: { type: "string", default: "0" },
      end: { type: "string" },
    },
  });
  const [input, output] = positionals;
  if (!input || !output || positionals.length > 2) {
    throw new Error(USAGE);
  }
  return {
    input,
    output,
    fps: parsePositiveInteger("--fps", values.fps),
    width: parseEvenInteger("--width", values.width),
    height: parseEvenInteger("--height", values.height),
    url: values.url,
    workers: parsePositiveInteger("--workers", values.workers),
    start: parseSeconds("--start", values.start),
    end:
      values.end === undefined ? undefined : parseSeconds("--end", values.end),
  };
}

function parseEvenInteger(option: string, value: string) {
  const parsed = parsePositiveInteger(option, value);
  if (parsed % 2 !== 0) {
    throw new Error(`${option} must be even for H.264 YUV420 output`);
  }
  return parsed;
}

function parseSeconds(option: string, value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${option} requires a non-negative number of seconds`);
  }
  return parsed;
}

function parsePositiveInteger(option: string, value: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${option} requires a positive integer`);
  }
  return parsed;
}

// Report load time, render progress with an ETA, and total time on stderr.
class RenderProgress {
  private readonly startedAt = performance.now();
  private renderStartedAt = this.startedAt;
  private frameCount = 0;

  log(message: string) {
    process.stderr.write(`${message}\n`);
  }

  loaded({ frameCount, fps }: { frameCount: number; fps: number }) {
    this.frameCount = frameCount;
    this.renderStartedAt = performance.now();
    this.log(
      `loaded in ${formatDuration(this.renderStartedAt - this.startedAt)}, rendering ${frameCount} frames (${formatDuration((frameCount / fps) * 1000)} of video)`,
    );
  }

  frame(written: number) {
    const elapsed = performance.now() - this.renderStartedAt;
    const remaining = (elapsed / written) * (this.frameCount - written);
    const percent = Math.floor((written / this.frameCount) * 100);
    this.overwrite(
      `frame ${written}/${this.frameCount} (${percent}%), ${formatDuration(elapsed)} elapsed, ${formatDuration(remaining)} left`,
    );
  }

  done(output: string) {
    this.overwrite(
      `rendered ${output} in ${formatDuration(performance.now() - this.startedAt)}`,
    );
    process.stderr.write("\n");
  }

  // Rewrite the current line and clear what a longer previous line left.
  private overwrite(message: string) {
    process.stderr.write(`\r${message}\x1b[K`);
  }
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
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
