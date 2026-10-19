// Compare two amp-sim.ts renders of the same project track by track, such as
// the ffmpeg chain against the app's amp (`--amp app`): the level difference,
// the delay between them, and the largest difference in any third-octave band
// from 100 Hz to 10 kHz. Each render's per-track `-amp.wav` files are the
// amp's output, before loudness matching and mixing.
//
// Usage:
//   tsx tools/amp-sim/compare.ts <out-dir> <tag-a> <tag-b>

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const USAGE = `\
usage: tsx tools/amp-sim/compare.ts <out-dir> <tag-a> <tag-b>`;

const execFileAsync = promisify(execFile);

const MAX_DELAY = 200;
const FFT_SIZE = 8192;

async function main() {
  const [outDir, tagA, tagB] = process.argv.slice(2);
  if (!outDir || !tagA || !tagB) {
    throw new Error(USAGE);
  }
  const files = fs
    .readdirSync(path.join(outDir, tagA))
    .filter((file) => file.endsWith("-amp.wav"))
    .filter((file) => fs.existsSync(path.join(outDir, tagB, file)))
    .sort();
  console.log(
    "| Track | Level, B − A | Delay of B | Largest band difference |",
  );
  console.log("| --- | --- | --- | --- |");
  for (const file of files) {
    const { rate, samples: a } = await readMono(path.join(outDir, tagA, file));
    const { samples: b } = await readMono(path.join(outDir, tagB, file));
    const delay = findDelay(a, b);
    // Skip the first second, where filters settle.
    const start = rate;
    const length = Math.min(a.length, b.length - Math.max(delay, 0)) - start;
    const alignedA = a.subarray(start, start + length);
    const alignedB = b.subarray(start + delay, start + delay + length);
    const level = toDb(measureRms(alignedB) / measureRms(alignedA));
    const bandsA = measureBands(alignedA, rate);
    const bandsB = measureBands(alignedB, rate);
    let largest = { difference: 0, frequency: 0 };
    bandsA.forEach(({ frequency, db }, i) => {
      const difference = bandsB[i]!.db - db;
      if (Math.abs(difference) > Math.abs(largest.difference)) {
        largest = { difference, frequency };
      }
    });
    console.log(
      `| ${file.replace(/-raw-amp\.wav$/, "")} | ${formatDb(level)} | ${delay} samples | ${formatDb(largest.difference)} at ${Math.round(largest.frequency)} Hz |`,
    );
  }
}

async function readMono(file: string) {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-ac", "1", "-f", "f32le", "-"],
    { encoding: "buffer", maxBuffer: 1 << 30 },
  );
  const { stdout: rate } = await execFileAsync("ffprobe", [
    ...["-v", "error", "-select_streams", "a:0"],
    ...["-show_entries", "stream=sample_rate", "-of", "csv=p=0", file],
  ]);
  return {
    rate: Number(rate.trim()),
    samples: new Float32Array(
      stdout.buffer,
      stdout.byteOffset,
      stdout.byteLength / 4,
    ),
  };
}

// The delay of b behind a that best lines them up, by cross-correlation.
function findDelay(a: Float32Array, b: Float32Array): number {
  const end = Math.min(a.length, b.length) - MAX_DELAY;
  let best = { delay: 0, score: -Infinity };
  for (let delay = -MAX_DELAY; delay <= MAX_DELAY; delay++) {
    let score = 0;
    for (let i = MAX_DELAY; i < end; i += 4) {
      score += a[i]! * b[i + delay]!;
    }
    if (score > best.score) {
      best = { delay, score };
    }
  }
  return best.delay;
}

// Average power in third-octave bands from 100 Hz to 10 kHz, over Hann
// windowed frames.
function measureBands(samples: Float32Array, rate: number) {
  const power = new Float64Array(FFT_SIZE / 2);
  let frames = 0;
  for (
    let offset = 0;
    offset + FFT_SIZE <= samples.length;
    offset += FFT_SIZE
  ) {
    const re = new Float64Array(FFT_SIZE);
    const im = new Float64Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE);
      re[i] = samples[offset + i]! * window;
    }
    transformFourier(re, im);
    for (let k = 0; k < FFT_SIZE / 2; k++) {
      power[k]! += re[k]! ** 2 + im[k]! ** 2;
    }
    frames++;
  }
  const bands: { frequency: number; db: number }[] = [];
  for (let frequency = 100; frequency <= 10000; frequency *= 2 ** (1 / 3)) {
    const k0 = Math.floor((frequency / 2 ** (1 / 6) / rate) * FFT_SIZE);
    const k1 = Math.ceil(((frequency * 2 ** (1 / 6)) / rate) * FFT_SIZE);
    let sum = 0;
    for (let k = k0; k <= k1; k++) {
      sum += power[k]!;
    }
    bands.push({ frequency, db: 10 * Math.log10(sum / frames) });
  }
  return bands;
}

// In-place radix-2 FFT.
function transformFourier(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k++) {
        const wr = Math.cos(angle * k);
        const wi = Math.sin(angle * k);
        const i = start + k;
        const j = i + size / 2;
        const xr = re[j]! * wr - im[j]! * wi;
        const xi = re[j]! * wi + im[j]! * wr;
        re[j] = re[i]! - xr;
        im[j] = im[i]! - xi;
        re[i]! += xr;
        im[i]! += xi;
      }
    }
  }
}

function measureRms(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) {
    sum += sample ** 2;
  }
  return Math.sqrt(sum / samples.length);
}

function toDb(ratio: number): number {
  return 20 * Math.log10(ratio);
}

function formatDb(db: number): string {
  return `${db >= 0 ? "+" : "−"}${Math.abs(db).toFixed(2)} dB`;
}

main();
