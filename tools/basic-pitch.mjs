// CLI to run Basic Pitch transcription on an audio file in Node, without a
// browser. Prints the detected notes.
//
// Usage:
//   pnpm basic-pitch input.wav    # any audio format supported by ffmpeg
//
// A synthetic C2/E2/G2 test input lives at e2e/fixtures/test-tones.pcm
// (regeneration documented in e2e/fixtures/README.md).
//
// Runs on plain @tensorflow/tfjs (slow CPU backend, no native deps). The
// model is loaded from the npm package through an in-memory IO handler
// because fetch(file://) is unavailable in Node.

import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// require() instead of ESM imports: both packages ship CJS/UMD entries whose
// named exports are unreliable through Node's ESM interop
const require = createRequire(import.meta.url);
const tf = require("@tensorflow/tfjs");
const {
  BasicPitch,
  noteFramesToTime,
  outputToNotesPoly,
} = require("@spotify/basic-pitch");

const MODEL_SAMPLE_RATE = 22050;

async function main() {
  const audioPath = process.argv[2];
  if (!audioPath) {
    console.error("usage: pnpm basic-pitch <input-audio>");
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

  // Reference decoder defaults: onset 0.5, frame 0.3, min length 5 frames
  const notes = noteFramesToTime(
    outputToNotesPoly(frames, onsets, 0.5, 0.3, 5, true, null, null),
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
function loadModelFromPackage() {
  const modelJsonPath =
    require.resolve("@spotify/basic-pitch/model/model.json");
  return (async () => {
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
        weightSpecs: modelJson.weightsManifest.flatMap(
          (group) => group.weights,
        ),
        weightData: weightData.buffer.slice(
          weightData.byteOffset,
          weightData.byteOffset + weightData.byteLength,
        ),
      }),
    );
  })();
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
