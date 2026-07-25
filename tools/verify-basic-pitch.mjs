// Verify Basic Pitch transcription locally without a browser, for debugging
// the model contract and decoder parameters.
//
// Usage:
//   pnpm verify-basic-pitch              # synthesized C2/E2/G2 test tones
//   pnpm verify-basic-pitch input.wav    # 16-bit PCM or float32 WAV
//
// Runs on plain @tensorflow/tfjs (slow CPU backend, no native deps). The
// model is loaded from the npm package through an in-memory IO handler
// because fetch(file://) is unavailable in Node, and WAV decode/resample is
// hand-rolled because Node has no Web Audio.

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

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
  const wavPath = process.argv[2];
  const pcm = wavPath
    ? await loadWavAsModelPcm(wavPath)
    : synthesizeTestSignal();
  console.log(
    wavPath
      ? `input: ${wavPath} (${(pcm.length / MODEL_SAMPLE_RATE).toFixed(2)}s at ${MODEL_SAMPLE_RATE}Hz mono)`
      : "input: synthesized C2/E2/G2 tones, 1s each",
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

// C2/E2/G2 (MIDI 36/40/43) for 1s each with a couple of harmonics and a
// short attack/release envelope, mirroring the planned e2e fixture
function synthesizeTestSignal() {
  const noteSeconds = 1;
  const midiNotes = [36, 40, 43];
  const pcm = new Float32Array(
    midiNotes.length * noteSeconds * MODEL_SAMPLE_RATE,
  );
  midiNotes.forEach((midi, index) => {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const offset = index * noteSeconds * MODEL_SAMPLE_RATE;
    const length = noteSeconds * MODEL_SAMPLE_RATE;
    for (let i = 0; i < length; i++) {
      const t = i / MODEL_SAMPLE_RATE;
      const envelope =
        Math.min(1, t / 0.01) * Math.min(1, (noteSeconds - t) / 0.05);
      pcm[offset + i] =
        envelope *
        (0.5 * Math.sin(2 * Math.PI * frequency * t) +
          0.15 * Math.sin(2 * Math.PI * 2 * frequency * t) +
          0.075 * Math.sin(2 * Math.PI * 3 * frequency * t));
    }
  });
  return pcm;
}

async function loadWavAsModelPcm(wavPath) {
  const { channels, sampleRate, samples } = parseWav(await readFile(wavPath));
  const mono = new Float32Array(samples.length / channels);
  for (let i = 0; i < mono.length; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      sum += samples[i * channels + c];
    }
    mono[i] = sum / channels;
  }
  return resampleLinear(mono, sampleRate, MODEL_SAMPLE_RATE);
}

// Minimal RIFF parser for 16-bit PCM (format 1) and float32 (format 3) WAV
function parseWav(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("Not a RIFF file");
  }
  let format = null;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let samples = null;
  let cursor = 12;
  while (cursor + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", cursor, cursor + 4);
    const chunkSize = buffer.readUInt32LE(cursor + 4);
    const body = cursor + 8;
    if (chunkId === "fmt ") {
      format = buffer.readUInt16LE(body);
      channels = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4);
      bitsPerSample = buffer.readUInt16LE(body + 14);
    } else if (chunkId === "data") {
      if (format === 1 && bitsPerSample === 16) {
        samples = new Float32Array(chunkSize / 2);
        for (let i = 0; i < samples.length; i++) {
          samples[i] = buffer.readInt16LE(body + i * 2) / 32768;
        }
      } else if (format === 3 && bitsPerSample === 32) {
        samples = new Float32Array(chunkSize / 4);
        for (let i = 0; i < samples.length; i++) {
          samples[i] = buffer.readFloatLE(body + i * 4);
        }
      } else {
        throw new Error(
          `Unsupported WAV: format=${format} bits=${bitsPerSample}`,
        );
      }
    }
    cursor = body + chunkSize + (chunkSize % 2);
  }
  if (!samples) {
    throw new Error("No data chunk found");
  }
  return { channels, sampleRate, samples };
}

function resampleLinear(samples, fromRate, toRate) {
  if (fromRate === toRate) {
    return samples;
  }
  const output = new Float32Array(
    Math.floor((samples.length * toRate) / fromRate),
  );
  for (let i = 0; i < output.length; i++) {
    const position = (i * fromRate) / toRate;
    const index = Math.floor(position);
    const fraction = position - index;
    const next = Math.min(index + 1, samples.length - 1);
    output[i] = samples[index] * (1 - fraction) + samples[next] * fraction;
  }
  return output;
}

const NOTE_NAMES = "C C# D D# E F F# G G# A A# B".split(" ");
function formatNoteName(midi) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

await main();
