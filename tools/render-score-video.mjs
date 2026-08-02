import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { Resvg } from "@resvg/resvg-js";

async function main() {
  const options = parseOptions(process.argv.slice(2));

  const browser = await chromium.launch({ channel: "chromium" });
  const page = await browser.newPage({
    viewport: { width: 1110, height: 556 },
  });
  await page.goto("http://localhost:5183/score-viewer");
  if (isMusicXmlPath(options.input)) {
    const source = {
      name: path.basename(options.input),
      xml: await readFile(options.input, "utf8"),
    };
    await page.evaluate(async (score) => {
      await window.__toyMidiScoreVideo.loadScore(score);
    }, source);
  } else {
    await page.evaluate(async (id) => {
      await window.__toyMidiScoreVideo.loadSample(id);
    }, options.input);
  }
  const scene = await page.evaluate(() =>
    window.__toyMidiScoreVideo.exportScene(),
  );
  await browser.close();
  const height = options.height ?? deriveHeight(scene.cursorPositions);
  const width = scene.scoreWidth;
  const scorePixels = new Resvg(buildScoreSvg(scene)).render().pixels;

  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-y",
      "-f",
      "rawvideo",
      "-pixel_format",
      "rgba",
      "-video_size",
      `${width}x${height}`,
      "-framerate",
      String(options.fps),
      "-i",
      "-",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      options.output,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );

  const frameCount = Math.ceil(scene.duration * options.fps);
  let viewportTop = Math.max(scene.cursorPositions[0].top - 24, 0);
  for (let frame = 0; frame < frameCount; frame++) {
    const scoreTime = (frame / options.fps) * (scene.tempo / 60 / 4);
    const cursor = resolveCursor(scene.cursorPositions, scoreTime);
    if (
      cursor.top < viewportTop ||
      cursor.top + cursor.height > viewportTop + height
    ) {
      viewportTop = Math.max(cursor.top - 24, 0);
    }
    const pixels = compositeFrame({
      cursor,
      height,
      scene,
      scorePixels,
      viewportTop,
      width,
    });
    if (!ffmpeg.stdin.write(pixels)) {
      await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve));
    }
  }
  ffmpeg.stdin.end();
  const exitCode = await new Promise((resolve) =>
    ffmpeg.once("close", resolve),
  );
  if (exitCode !== 0) {
    throw new Error(`ffmpeg exited with code ${exitCode}`);
  }
}

function parseOptions(args) {
  const positional = [];
  const options = { fps: 30 };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    switch (argument) {
      case "--height": {
        options.height = parsePositiveInteger(argument, args[++index]);
        if (options.height % 2 !== 0) {
          throw new Error("--height must be even for H.264 YUV420 output");
        }
        break;
      }
      case "--fps": {
        options.fps = parsePositiveInteger(argument, args[++index]);
        break;
      }
      default: {
        if (argument.startsWith("--")) {
          throw new Error(`Unknown option: ${argument}`);
        }
        positional.push(argument);
      }
    }
  }
  if (positional.length > 2) {
    throw new Error(
      "Expected at most a MusicXML path or sample id and output path",
    );
  }
  return {
    ...options,
    input: positional[0] ?? "cursor-wrapping",
    output: positional[1] ?? ".tmp/score-video.mp4",
  };
}

function isMusicXmlPath(input) {
  return input.endsWith(".xml") || input.endsWith(".musicxml");
}

function deriveHeight(positions) {
  const systems = [];
  const systemIds = new Set();
  for (const position of positions) {
    if (!systemIds.has(position.systemId)) {
      systemIds.add(position.systemId);
      systems.push({
        bottom: position.top + position.height,
        top: position.top,
      });
    }
  }
  if (systems.length === 0) {
    throw new Error("Score has no rendered systems");
  }
  const lastVisibleSystem = systems[Math.min(1, systems.length - 1)];
  return roundUpToEven(lastVisibleSystem.bottom - systems[0].top + 48);
}

function roundUpToEven(value) {
  return Math.ceil(value / 2) * 2;
}

function parsePositiveInteger(option, value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${option} requires a positive integer`);
  }
  return parsed;
}

function resolveCursor(positions, scoreTime) {
  let nextIndex = positions.findIndex((position) => position.time > scoreTime);
  if (nextIndex < 1) {
    nextIndex = Math.min(Math.max(nextIndex, 1), positions.length - 1);
  }
  const current = positions[nextIndex - 1];
  const next = positions[nextIndex];
  const progress =
    current.systemId === next.systemId
      ? (scoreTime - current.time) / (next.time - current.time)
      : 0;
  return {
    height: current.height,
    top: current.top,
    x: current.x + (next.x - current.x) * progress,
  };
}

function buildScoreSvg(scene) {
  const scoreSvg = scene.scoreSvg
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.scoreWidth}" height="${scene.scoreHeight}" viewBox="0 0 ${scene.scoreWidth} ${scene.scoreHeight}">
      <rect width="100%" height="100%" fill="white"/>
      ${scoreSvg}
    </svg>`;
}

function compositeFrame({
  cursor,
  height,
  scene,
  scorePixels,
  viewportTop,
  width,
}) {
  const pixels = Buffer.alloc(width * height * 4, 0xff);
  for (let index = 3; index < pixels.length; index += 4) {
    pixels[index] = 0xff;
  }

  const destinationX = 0;
  const sourceY = Math.max(Math.floor(viewportTop - 24), 0);
  const destinationY = Math.max(Math.floor(24 - viewportTop), 0);
  const rows = Math.min(scene.scoreHeight - sourceY, height - destinationY);
  for (let row = 0; row < rows; row++) {
    const sourceStart = (sourceY + row) * scene.scoreWidth * 4;
    const destinationStart = ((destinationY + row) * width + destinationX) * 4;
    pixels.set(
      scorePixels.subarray(sourceStart, sourceStart + scene.scoreWidth * 4),
      destinationStart,
    );
  }

  const cursorX = Math.round(destinationX + cursor.x);
  const cursorTop = Math.round(24 + cursor.top - viewportTop);
  const cursorBottom = Math.min(Math.round(cursorTop + cursor.height), height);
  for (let y = Math.max(cursorTop, 0); y < cursorBottom; y++) {
    for (let x = cursorX; x < cursorX + 3; x++) {
      pixels.set([0x3b, 0x82, 0xf6, 0xff], (y * width + x) * 4);
    }
  }
  return pixels;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
