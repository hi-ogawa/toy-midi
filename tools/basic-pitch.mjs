// CLI to run Basic Pitch transcription on an audio file in Node, without a
// browser. Prints the detected notes.
//
// Usage:
//   pnpm basic-pitch input.wav    # any audio format supported by ffmpeg
//   pnpm basic-pitch input.wav --onset 0.5 --frame 0.3 --min-length 5
//
// A synthetic C2/E2/G2 test input lives at e2e/fixtures/test-tones.pcm
// (regeneration documented in e2e/fixtures/README.md).
//
// Runs on plain @tensorflow/tfjs (slow CPU backend, no native deps). The
// model is loaded from the npm package through an in-memory IO handler
// because fetch(file://) is unavailable in Node.

import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import {
  BasicPitch,
  noteFramesToTime,
  outputToNotesPoly,
} from "@spotify/basic-pitch";
import * as tf from "@tensorflow/tfjs";

const execFileAsync = promisify(execFile);

const MODEL_SAMPLE_RATE = 22050;

const USAGE = `\
usage: pnpm basic-pitch <input-audio> [options]

options:
  --onset <0-1>        onset threshold, higher = fewer note splits (default 0.5)
  --frame <0-1>        frame threshold, higher = fewer detected notes (default 0.3)
  --min-length <n>     drop notes shorter than n frames, 1 frame ≈ 11.6ms (default 5)
  -h, --help           show this help

Decoder defaults follow the reference implementation.`;

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        onset: { type: "string", default: "0.5" },
        frame: { type: "string", default: "0.3" },
        "min-length": { type: "string", default: "5" },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (e) {
    console.error(e.message);
    console.error(USAGE);
    process.exit(1);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const audioPath = positionals[0];
  if (!audioPath) {
    console.error(USAGE);
    process.exit(1);
  }
  const pcm = await loadAudioAsModelPcm(audioPath);
  console.log(
    `input: ${audioPath} (${(pcm.length / MODEL_SAMPLE_RATE).toFixed(2)}s at ${MODEL_SAMPLE_RATE}Hz mono)`,
  );

  await tf.ready();
  console.log(`tfjs backend: ${tf.getBackend()}`);

  const basicPitch = new BasicPitch(loadModelFromPackage());
  const frames = [];
  const onsets = [];
  const startedAt = performance.now();
  await basicPitch.evaluateModel(
    pcm,
    (chunkFrames, chunkOnsets) => {
      frames.push(...chunkFrames);
      onsets.push(...chunkOnsets);
    },
    (percent) => {
      process.stdout.write(`\rinference: ${Math.round(percent * 100)}%`);
    },
  );
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  console.log(`\rinference: done in ${seconds}s (${frames.length} frames)`);

  const onsetThreshold = Number(values.onset);
  const frameThreshold = Number(values.frame);
  const minNoteLength = Number(values["min-length"]);
  console.log(
    `decode: onset=${onsetThreshold} frame=${frameThreshold} min-length=${minNoteLength}`,
  );
  const notes = noteFramesToTime(
    outputToNotesPoly(
      frames,
      onsets,
      onsetThreshold,
      frameThreshold,
      minNoteLength,
      true,
      null,
      null,
    ),
  );
  notes.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);

  console.log(`notes: ${notes.length}`);
  for (const note of notes) {
    console.log(
      [
        `start=${note.startTimeSeconds.toFixed(3)}s`,
        `dur=${note.durationSeconds.toFixed(3)}s`,
        `midi=${note.pitchMidi}`,
        formatNoteName(note.pitchMidi).padEnd(4),
        `amp=${note.amplitude.toFixed(2)}`,
      ].join("  "),
    );
  }
}

// tf.loadGraphModel cannot fetch file:// URLs, so read model.json and the
// weight shards from the package and hand them over as in-memory artifacts
async function loadModelFromPackage() {
  const modelJsonPath = fileURLToPath(
    import.meta.resolve("@spotify/basic-pitch/model/model.json"),
  );
  const modelJson = JSON.parse(await readFile(modelJsonPath, "utf8"));
  const shards = await Promise.all(
    modelJson.weightsManifest
      .flatMap((group) => group.paths)
      .map((p) => readFile(path.join(path.dirname(modelJsonPath), p))),
  );
  const weightData = Buffer.concat(shards);
  return tf.loadGraphModel(
    tf.io.fromMemory({
      modelTopology: modelJson.modelTopology,
      weightSpecs: modelJson.weightsManifest.flatMap((group) => group.weights),
      weightData: weightData.buffer.slice(
        weightData.byteOffset,
        weightData.byteOffset + weightData.byteLength,
      ),
    }),
  );
}

async function loadAudioAsModelPcm(audioPath) {
  // .pcm files are assumed to already be f32le mono at the model sample rate
  // (like e2e/fixtures/test-tones.pcm); anything else is decoded by ffmpeg
  if (audioPath.endsWith(".pcm")) {
    return bufferToFloat32(await readFile(audioPath));
  }
  const tmpDir = path.join(import.meta.dirname, "../.tmp");
  const tmpPath = path.join(tmpDir, "basic-pitch-input.pcm");
  await mkdir(tmpDir, { recursive: true });
  await execFileAsync("ffmpeg", [
    ...["-loglevel", "error", "-y"],
    ...["-i", audioPath],
    ...["-vn", "-ac", "1", "-ar", String(MODEL_SAMPLE_RATE)],
    ...["-c:a", "pcm_f32le", "-f", "f32le"],
    tmpPath,
  ]);
  return bufferToFloat32(await readFile(tmpPath));
}

function bufferToFloat32(buffer) {
  if (buffer.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error(`invalid f32le data: ${buffer.byteLength} bytes`);
  }
  return new Float32Array(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
  );
}

const NOTE_NAMES = "C C# D D# E F F# G G# A A# B".split(" ");
function formatNoteName(midi) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

main().catch((e) => {
  console.log(e);
  process.exitCode = 1;
});
