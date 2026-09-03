// Render pitch-preserving playback-rate changes from an audio file with WSOLA.
//
// Usage:
//   tsx tools/wsola.ts input.wav --rate 0.5
//   tsx tools/wsola.ts input.mp3 --start 30 --duration 20 --output .tmp/slow.wav

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs, promisify } from "node:util";
import { WsolaProcessor } from "../src/lib/recorder/wsola.ts";

const execFileAsync = promisify(execFile);
const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const TMP_DIR = path.join(import.meta.dirname, "../.tmp");

const USAGE = `\
usage: tsx tools/wsola.ts <input-audio> [options]

options:
  --rate <number>       playback rate (default 0.5)
  --output <path>       WAV output path (default .tmp/wsola-output.wav)
  --start <seconds>     input excerpt start
  --duration <seconds>  input excerpt duration
  --window-ms <number>  overlap-add window size (default 20)
  --search-ms <number>  candidate-start search interval (default 30)
  --block-size <frames> output pull size (default 128)
  -h, --help            show this help`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      rate: { type: "string", default: "0.5" },
      output: { type: "string" },
      start: { type: "string" },
      duration: { type: "string" },
      "window-ms": { type: "string", default: "20" },
      "search-ms": { type: "string", default: "30" },
      "block-size": { type: "string", default: "128" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }

  const inputPath = positionals[0];
  if (!inputPath) {
    throw new Error(USAGE);
  }
  const rate = parsePositiveNumber(values.rate, "--rate");
  const windowMs = parsePositiveNumber(values["window-ms"], "--window-ms");
  const searchMs = parsePositiveNumber(values["search-ms"], "--search-ms");
  const blockSize = parsePositiveInteger(values["block-size"], "--block-size");
  const start = parseOptionalNonNegativeNumber(values.start, "--start");
  const duration = parseOptionalPositiveNumber(values.duration, "--duration");
  const outputPath = path.resolve(
    values.output ?? path.join(TMP_DIR, "wsola-output.wav"),
  );

  await mkdir(TMP_DIR, { recursive: true });
  const inputPcmPath = path.join(TMP_DIR, "wsola-input.f32le");
  const outputPcmPath = path.join(TMP_DIR, "wsola-output.f32le");
  await decodeAudio({ inputPath, outputPath: inputPcmPath, start, duration });
  const interleavedInput = bufferToFloat32(await readFile(inputPcmPath));
  const channelData = deinterleave(interleavedInput, CHANNELS);
  const inputSeconds = channelData[0].length / SAMPLE_RATE;
  console.log(
    `input: ${inputPath} (${inputSeconds.toFixed(2)}s, stereo, ${SAMPLE_RATE}Hz)`,
  );

  const processor = new WsolaProcessor({
    channelData,
    sampleRate: SAMPLE_RATE,
    playbackRate: rate,
    windowSeconds: windowMs / 1000,
    searchSeconds: searchMs / 1000,
  });
  console.log(
    `wsola: rate=${rate} window=${windowMs}ms hop=${windowMs / 2}ms ` +
      `search=${searchMs}ms block=${blockSize}`,
  );

  const output = new Float32Array(processor.outputFrames * CHANNELS);
  const block = Array.from(
    { length: CHANNELS },
    () => new Float32Array(blockSize),
  );
  let outputFrame = 0;
  const startedAt = performance.now();
  while (!processor.finished) {
    const written = processor.render(block);
    for (let frame = 0; frame < written; frame++) {
      for (let channel = 0; channel < CHANNELS; channel++) {
        output[(outputFrame + frame) * CHANNELS + channel] =
          block[channel][frame];
      }
    }
    outputFrame += written;
  }
  const renderSeconds = (performance.now() - startedAt) / 1000;
  const outputSeconds = outputFrame / SAMPLE_RATE;
  const stats = processor.getStats();
  console.log(
    `render: ${outputSeconds.toFixed(2)}s output in ${renderSeconds.toFixed(2)}s ` +
      `(${(outputSeconds / renderSeconds).toFixed(1)}x realtime)`,
  );
  console.log(
    `picks: natural=${stats.naturalContinuations} searched=${stats.searchedContinuations}`,
  );

  await writeFile(
    outputPcmPath,
    Buffer.from(output.buffer, output.byteOffset, output.byteLength),
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await encodeWav({ inputPath: outputPcmPath, outputPath });
  console.log(`output: ${outputPath}`);
}

async function decodeAudio({
  inputPath,
  outputPath,
  start,
  duration,
}: {
  inputPath: string;
  outputPath: string;
  start?: number;
  duration?: number;
}) {
  const inputOptions = [];
  if (start !== undefined) {
    inputOptions.push("-ss", String(start));
  }
  const outputOptions = [];
  if (duration !== undefined) {
    outputOptions.push("-t", String(duration));
  }
  await execFileAsync("ffmpeg", [
    "-loglevel",
    "error",
    "-y",
    ...inputOptions,
    "-i",
    inputPath,
    ...outputOptions,
    "-vn",
    "-ac",
    String(CHANNELS),
    "-ar",
    String(SAMPLE_RATE),
    "-c:a",
    "pcm_f32le",
    "-f",
    "f32le",
    outputPath,
  ]);
}

async function encodeWav({
  inputPath,
  outputPath,
}: {
  inputPath: string;
  outputPath: string;
}) {
  await execFileAsync("ffmpeg", [
    "-loglevel",
    "error",
    "-y",
    "-f",
    "f32le",
    "-ar",
    String(SAMPLE_RATE),
    "-ac",
    String(CHANNELS),
    "-i",
    inputPath,
    "-c:a",
    "pcm_f32le",
    outputPath,
  ]);
}

function deinterleave(input: Float32Array, channels: number): Float32Array[] {
  if (input.length % channels !== 0) {
    throw new Error("Decoded PCM has an incomplete audio frame.");
  }
  const output = Array.from(
    { length: channels },
    () => new Float32Array(input.length / channels),
  );
  for (let frame = 0; frame < output[0].length; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      output[channel][frame] = input[frame * channels + channel];
    }
  }
  return output;
}

function bufferToFloat32(buffer: Buffer): Float32Array {
  if (buffer.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error(`Invalid f32le data: ${buffer.byteLength} bytes.`);
  }
  return new Float32Array(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
  );
}

function parsePositiveNumber(value: string, option: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${option} must be a positive number.`);
  }
  return number;
}

function parsePositiveInteger(value: string, option: string): number {
  const number = parsePositiveNumber(value, option);
  if (!Number.isInteger(number)) {
    throw new Error(`${option} must be an integer.`);
  }
  return number;
}

function parseOptionalNonNegativeNumber(
  value: string | undefined,
  option: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${option} must be a non-negative number.`);
  }
  return number;
}

function parseOptionalPositiveNumber(
  value: string | undefined,
  option: string,
): number | undefined {
  return value === undefined ? undefined : parsePositiveNumber(value, option);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
