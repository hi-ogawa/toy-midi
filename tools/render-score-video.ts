import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { type Browser, chromium } from "@playwright/test";

// Render a silent score video by stepping the real score viewer frame by frame
// and screenshotting its score area, so the video matches interactive playback.
//
//   pnpm render-score-video score.musicxml score.mp4
//   pnpm render-score-video score.musicxml score.mp4 --url http://localhost:5173

const DEFAULT_URL = "https://toy-midi.hiro18181.workers.dev";

// Fixed score layout width plus the continuous sheet and viewport padding.
const VIEWPORT_WIDTH = 1190;
const HEADER_HEIGHT = 53;

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const source = {
    name: path.basename(options.input),
    xml: await readFile(options.input, "utf8"),
  };

  // Open one viewer page per worker, each with the score loaded.
  const browser = await chromium.launch();
  const pages = await Promise.all(
    Array.from({ length: options.workers }, () =>
      openScorePage({ browser, options, source }),
    ),
  );
  const { duration, clip } = pages[0];

  // Stream frames to FFmpeg in order while workers capture them out of order.
  const ffmpeg = spawn(
    "ffmpeg",
    [
      ...["-y", "-loglevel", "error"],
      ...["-f", "image2pipe", "-framerate", String(options.fps)],
      ...["-c:v", "png", "-i", "-"],
      ...["-an", "-c:v", "libx264", "-pix_fmt", "yuv420p"],
      options.output,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const exited = new Promise<number | null>((resolve) =>
    ffmpeg.once("close", resolve),
  );
  const frameCount = Math.ceil(duration * options.fps);
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
          process.stderr.write(`\rframe ${nextFrame}/${frameCount}`);
        }
      }
    });
  }

  // Interleave frames across workers. Each page still moves forward in small
  // steps, so the viewer's cursor-containment scrolling matches sequential
  // playback as long as no system lasts shorter than one step.
  const startedAt = performance.now();
  await Promise.all(
    pages.map(async ({ page, cdp }, worker) => {
      for (let frame = worker; frame < frameCount; frame += options.workers) {
        await page.evaluate(
          (seconds) => window.__toyMidiScoreVideo!.seek(seconds),
          frame / options.fps,
        );
        const { data } = await cdp.send("Page.captureScreenshot", {
          format: "png",
          clip: { ...clip, scale: 1 },
          optimizeForSpeed: true,
        });
        enqueue(frame, Buffer.from(data, "base64"));
      }
    }),
  );
  await writing;
  ffmpeg.stdin.end();
  await browser.close();
  const exitCode = await exited;
  if (exitCode !== 0) {
    throw new Error(`ffmpeg exited with code ${exitCode}`);
  }
  const elapsed = (performance.now() - startedAt) / 1000;
  process.stderr.write(
    `\rrendered ${frameCount} frames (${duration.toFixed(1)}s) in ${elapsed.toFixed(1)}s\n`,
  );
}

async function openScorePage({
  browser,
  options,
  source,
}: {
  browser: Browser;
  options: Options;
  source: { name: string; xml: string };
}) {
  const page = await browser.newPage({
    viewport: {
      width: VIEWPORT_WIDTH,
      height: HEADER_HEIGHT + options.height,
    },
  });
  await page.goto(new URL("/score-viewer", options.url).href);
  await page.waitForFunction(() => window.__toyMidiScoreVideo);
  const duration = await page.evaluate(async (source) => {
    await window.__toyMidiScoreVideo!.load(source);
    await document.fonts.ready;
    return window.__toyMidiScoreVideo!.getDuration();
  }, source);
  // Hide the scrollbar so the frame shows only the score.
  await page.addStyleTag({
    content: "::-webkit-scrollbar { display: none; }",
  });
  const root = await page
    .getByTestId("score-viewer-runtime-root")
    .boundingBox();
  if (!root) {
    throw new Error("Score viewer is not visible");
  }
  const clip = {
    x: 0,
    y: root.y,
    width: VIEWPORT_WIDTH,
    height: options.height,
  };
  const cdp = await page.context().newCDPSession(page);
  return { page, cdp, duration, clip };
}

type Options = ReturnType<typeof parseOptions>;

function parseOptions(args: string[]) {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      fps: { type: "string", default: "30" },
      height: { type: "string", default: "556" },
      url: { type: "string", default: DEFAULT_URL },
      workers: { type: "string", default: "4" },
    },
  });
  const [input, output] = positionals;
  if (!input || !output || positionals.length > 2) {
    throw new Error(
      "Usage: render-score-video <input.musicxml> <output.mp4> [--fps 30] [--height 556] [--workers 4] [--url URL]",
    );
  }
  const height = parsePositiveInteger("--height", values.height);
  if (height % 2 !== 0) {
    throw new Error("--height must be even for H.264 YUV420 output");
  }
  return {
    input,
    output,
    fps: parsePositiveInteger("--fps", values.fps),
    height,
    url: values.url,
    workers: parsePositiveInteger("--workers", values.workers),
  };
}

function parsePositiveInteger(option: string, value: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${option} requires a positive integer`);
  }
  return parsed;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
