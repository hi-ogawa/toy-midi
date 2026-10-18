import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import type { Browser } from "playwright-core";
import { DEFAULT_URL, launchBrowser, openCliPage } from "./browser";
import {
  finishLine,
  formatDuration,
  rewriteLine,
  style,
  writeLine,
} from "./terminal";

// Render a silent score video by stepping the real score viewer frame by frame
// and screenshotting its score area, so the video matches interactive playback.

const USAGE =
  "Usage: toy-midi score-video <input.musicxml> <output.mp4> [--fps 30] [--width 1280] [--height 480] [--start 0] [--end SECONDS] [--workers 4] [--url URL]";

export async function runScoreVideo(args: string[]) {
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
  const progress = new RenderProgress(options);
  progress.start();
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
  progress.loaded({ frameCount });
  const frames = createReorderBuffer(
    async ({ index, item }: { index: number; item: Buffer }) => {
      if (!ffmpeg.stdin.write(item)) {
        await once(ffmpeg.stdin, "drain");
      }
      if ((index + 1) % options.fps === 0) {
        progress.frame(index + 1);
      }
    },
  );

  await Promise.all(
    pages.map(async ({ page, cdp }, worker) => {
      // Replay frames before this worker's first frame without capturing,
      // mainly those skipped by --start, because the viewer's scroll position
      // depends on which systems the cursor has passed through.
      await page.evaluate(
        ({ workerStartFrame, fps }) => {
          for (let frame = 0; frame < workerStartFrame; frame++) {
            window.__toyMidiCli!.scoreViewer!.seek(frame / fps);
          }
        },
        { workerStartFrame: startFrame + worker, fps: options.fps },
      );
      // Each seek skips frames by the worker count, which would miss a system
      // shorter than that, but real scores have no such systems.
      for (let frame = worker; frame < frameCount; frame += options.workers) {
        await page.evaluate(
          (seconds) => window.__toyMidiCli!.scoreViewer!.seek(seconds),
          (startFrame + frame) / options.fps,
        );
        const { data } = await cdp.send("Page.captureScreenshot", {
          format: "png",
          optimizeForSpeed: true,
        });
        frames.push({ index: frame, item: Buffer.from(data, "base64") });
      }
    }),
  );
  await frames.flush();
  ffmpeg.stdin.end();
  const exitCode = await exited;
  if (exitCode !== 0) {
    throw new Error(`ffmpeg exited with code ${exitCode}`);
  }
  progress.done();
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
  const page = await openCliPage({
    browser,
    url: options.url,
    pathname: "/score-capture",
    api: "scoreViewer",
    viewport: { width: options.width, height: options.height },
  });
  const duration = await page.evaluate(async (score) => {
    const viewer = window.__toyMidiCli!.scoreViewer!;
    // The composition adds its own title, so the score layer omits it.
    await viewer.load({
      score,
      settings: {
        layout: "continuous",
        showSectionLabels: true,
        showTitle: false,
        titleSpacing: 0,
      },
    });
    await document.fonts.ready;
    viewer.setScaleToFitViewport();
    // Frame the first system like every later one, instead of showing the
    // sheet's top margin, which never scrolls into view again.
    viewer.scrollToCursor();
    return viewer.getDuration();
  }, source);
  const cdp = await page.context().newCDPSession(page);
  return { page, cdp, duration };
}

// Accept items out of order and consume them one at a time in index order.
// Every push schedules a drain, so the drain scheduled by the final push sees
// all items and consumes whatever earlier drains left behind.
function createReorderBuffer<T>(
  consume: (entry: { index: number; item: T }) => Promise<void>,
) {
  const pending = new Map<number, T>();
  let nextIndex = 0;
  let draining = Promise.resolve();
  let error: unknown;
  // Consume items from nextIndex until the first one that hasn't arrived yet.
  // push chains drains one after another, so they never run concurrently.
  async function drain() {
    while (pending.has(nextIndex)) {
      const next = pending.get(nextIndex)!;
      pending.delete(nextIndex);
      await consume({ index: nextIndex++, item: next });
    }
  }
  return {
    push({ index, item }: { index: number; item: T }) {
      if (error) {
        throw error;
      }
      pending.set(index, item);
      draining = draining.then(drain);
      // Record the failure for push, and mark the rejection as handled.
      draining.catch((e) => {
        error = e;
      });
    },
    flush: () => draining,
  };
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

// Report the render setup, each finished phase with its time, and live frame
// progress on stderr. Colors and in-place updates apply only on a terminal.
class RenderProgress {
  private readonly startedAt = performance.now();
  private phaseStartedAt = this.startedAt;
  private frameCount = 0;

  constructor(private readonly options: CliOptions) {}

  start() {
    const { input, output, url, width, height, fps, workers } = this.options;
    writeLine(style("bold", "score-video"));
    for (const [label, value] of [
      ["input", input],
      ["output", style("cyan", output)],
      ["app", url],
      ["video", `${width}x${height} · ${fps} fps · ${workers} workers`],
    ]) {
      writeLine(`  ${style("dim", label.padEnd(6))}  ${value}`);
    }
    writeLine("");
    this.pending(`loading ${workers} pages`);
  }

  loaded({ frameCount }: { frameCount: number }) {
    this.frameCount = frameCount;
    this.step(`loaded ${this.options.workers} pages`);
  }

  frame(written: number) {
    const elapsed = performance.now() - this.phaseStartedAt;
    const remaining = (elapsed / written) * (this.frameCount - written);
    const percent = Math.floor((written / this.frameCount) * 100);
    this.pending(
      `frame ${written}/${this.frameCount} (${percent}%), ${formatDuration(elapsed)} elapsed, ${formatDuration(remaining)} left`,
    );
  }

  done() {
    const videoLength = (this.frameCount / this.options.fps) * 1000;
    this.step(
      `rendered ${this.frameCount} frames (${formatDuration(videoLength)} of video)`,
    );
    this.step(
      `wrote ${style("cyan", this.options.output)}`,
      `${formatDuration(performance.now() - this.startedAt)} total`,
    );
  }

  private pending(message: string) {
    rewriteLine(`${style("dim", "⋯")} ${message}`);
  }

  private step(message: string, time?: string) {
    const now = performance.now();
    time ??= formatDuration(now - this.phaseStartedAt);
    this.phaseStartedAt = now;
    finishLine(`${style("green", "✓")} ${message}  ${style("dim", time)}`);
  }
}
