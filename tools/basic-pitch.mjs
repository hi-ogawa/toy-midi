// CLI to run Basic Pitch transcription on an audio file in Node, without a
// browser. Prints the detected notes.
//
// Usage:
//   node tools/basic-pitch.mjs input.wav    # any audio format supported by ffmpeg
//   node tools/basic-pitch.mjs input.wav --onset 0.5 --frame 0.3 --min-length 5
//
// A synthetic C4/E4/G4/C5 test input lives at e2e/fixtures/test-tones.pcm
// (regeneration documented in e2e/fixtures/README.md).
//
// Runs on plain @tensorflow/tfjs (slow CPU backend, no native deps). The
// model is loaded from the npm package through an in-memory IO handler
// because fetch(file://) is unavailable in Node.

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import {
  BasicPitch,
  noteFramesToTime,
  outputToNotesPoly,
} from "@spotify/basic-pitch";
import * as tf from "@tensorflow/tfjs";
// default import: @tonejs/midi's CJS bundle defeats Node's named-export detection
import tonejsMidi from "@tonejs/midi";

const { Midi } = tonejsMidi;

const execFileAsync = promisify(execFile);

const MODEL_SAMPLE_RATE = 22050;
const TMP_DIR = path.join(import.meta.dirname, "../.tmp");

const USAGE = `\
usage: node tools/basic-pitch.mjs <input-audio> [options]

options:
  --onset <0-1>        onset threshold, higher = fewer note splits (default 0.5)
  --frame <0-1>        frame threshold, higher = fewer detected notes (default 0.3)
  --min-length <n>     drop notes shorter than n frames, 1 frame ≈ 11.6ms (default 5)
  --midi <out.mid>     MIDI output path (default .tmp/basic-pitch-output.mid),
                       converted like the app's audio-to-MIDI panel + MIDI export
  --bpm <n>            project tempo for the seconds→beats conversion (default 120)
  --offset <seconds>   track offset added to note starts (default 0)
  --dump               print each detected note to stdout
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
        midi: { type: "string" },
        bpm: { type: "string", default: "120" },
        offset: { type: "string", default: "0" },
        dump: { type: "boolean", default: false },
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
  if (values.dump) {
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

  const midiPath = values.midi ?? path.join(TMP_DIR, "basic-pitch-output.mid");
  await writeMidi(midiPath, notes, {
    bpm: Number(values.bpm),
    offsetSeconds: Number(values.offset),
  });
  console.log(
    `midi: wrote ${midiPath} (bpm=${values.bpm} offset=${values.offset}s)`,
  );
}

// Mirror the app's audio-to-MIDI panel commit (seconds→beats at the project
// tempo, track offset added to starts, amplitude→velocity) followed by its
// tick-based MIDI export, so the file round-trips through MIDI import into
// the same notes a browser transcription session would produce
async function writeMidi(outPath, notes, { bpm, offsetSeconds }) {
  const secondsToBeats = (seconds) => (seconds / 60) * bpm;
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const track = midi.addTrack();
  const ppq = midi.header.ppq;
  for (const note of notes) {
    track.addNote({
      midi: note.pitchMidi,
      ticks: Math.round(
        secondsToBeats(note.startTimeSeconds + offsetSeconds) * ppq,
      ),
      durationTicks: Math.max(
        1,
        Math.round(secondsToBeats(note.durationSeconds) * ppq),
      ),
      velocity:
        Math.max(1, Math.min(127, Math.round(note.amplitude * 127))) / 127,
    });
  }
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, midi.toArray());
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
  const tmpPath = path.join(TMP_DIR, "basic-pitch-input.pcm");
  await mkdir(TMP_DIR, { recursive: true });
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
