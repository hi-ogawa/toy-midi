// Mix each piece's stems dry, and with each reverb engine on a shared send
// bus, then normalize every version to -16 LUFS, so the comparison is of the
// reverb rather than of loudness.
//
// Usage:
//   tsx tools/reverb-ab/mix.ts [--out .tmp/reverb-ab]

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { dattorro, freeverb, REVERB_DEFAULTS, type Reverb } from "./engines.ts";
import { PIECES, slugify } from "./render-stems.ts";

const SAMPLE_RATE = 48_000;
const TARGET_LUFS = -16;

// Room sizes chosen so both engines decay 60 dB in about 1.8 s, a medium
// hall, so the A/B compares each engine's character rather than its tail
// length. At FluidSynth's default room size, Freeverb decays in about 1.2 s
// and Dattorro in about 2.6 s.
const ENGINES: Record<string, Reverb> = {
  freeverb: freeverb({ ...REVERB_DEFAULTS, roomsize: 0.694 }),
  dattorro: dattorro({ ...REVERB_DEFAULTS, roomsize: 0.306 }),
};

type Track = {
  name: string;
  program?: number;
  bank?: number;
  soundfont?: string;
};

// Reverb level relative to the dry track, by instrument family, after #869's
// measurements of the synth's built-in reverb: pads and leads about -16 dB,
// choir and flute about -24 dB, and piano, strings, guitar, harp, and drums
// about -30 dB. Families #869 doesn't name are placed by analogy.
function sendDb(track: Track): number {
  const p = track.program ?? 0;
  if (track.bank === 128 || track.soundfont) {
    return -30;
  }
  if (p >= 80 && p <= 95) {
    return -16;
  } // synth leads and pads
  if (p >= 52 && p <= 79) {
    return -24;
  } // choir, brass, reeds, and pipes
  if (p >= 8 && p <= 23) {
    return -24;
  } // chromatic percussion and organ
  if (p >= 32 && p <= 39) {
    return -36;
  } // bass
  return -30; // piano, guitar, strings, ensembles, harp, timpani, ethnic
}

function decode(file: string): Float32Array {
  const bytes = execFileSync(
    "ffmpeg",
    [
      "-v",
      "quiet",
      "-i",
      file,
      "-ac",
      "2",
      "-ar",
      String(SAMPLE_RATE),
      "-f",
      "f32le",
      "-",
    ],
    { maxBuffer: 2 ** 31 - 1 },
  );
  return new Float32Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.length / 4,
  ).slice();
}

function measureLufs(stereo: Float32Array, scratch: string): number {
  writeFileSync(
    scratch,
    Buffer.from(stereo.buffer, stereo.byteOffset, stereo.byteLength),
  );
  const out = execFileSync("sh", [
    "-c",
    `ffmpeg -hide_banner -nostats -f f32le -ar ${SAMPLE_RATE} -ac 2 -i ${scratch} -af ebur128 -f null - 2>&1 | grep -E '^ +I:' | tail -1`,
  ]).toString();
  return Number(out.match(/-?[\d.]+/)![0]);
}

function interleave(left: Float32Array, right: Float32Array): Float32Array {
  const out = new Float32Array(left.length * 2);
  for (let i = 0; i < left.length; i++) {
    out[2 * i] = left[i];
    out[2 * i + 1] = right[i];
  }
  return out;
}

function main() {
  const { values } = parseArgs({
    options: { out: { type: "string", default: ".tmp/reverb-ab" } },
  });
  const outDir = path.resolve(values.out);
  const scratch = path.join(outDir, "scratch.f32");
  mkdirSync(path.join(outDir, "mp3"), { recursive: true });

  // Each engine's wet gain on a 1 s noise burst, so a send level means the
  // same reverb return whatever the engine.
  const calibration: Record<string, number> = {};
  const noise = new Float32Array(SAMPLE_RATE * 3);
  let seed = 1;
  for (let i = 0; i < SAMPLE_RATE; i++) {
    seed = (seed * 16_807) % 2_147_483_647;
    noise[i] = (seed / 2_147_483_647 - 0.5) * 0.5;
  }
  const reference = measureLufs(interleave(noise, noise), scratch);
  for (const [name, reverb] of Object.entries(ENGINES)) {
    calibration[name] =
      measureLufs(interleave(...reverb(noise, SAMPLE_RATE)), scratch) -
      reference;
  }

  for (const piece of PIECES) {
    const dir = path.join(outDir, slugify(piece));
    const project = JSON.parse(
      readFileSync(path.join(dir, "project.json"), "utf8"),
    );
    const tracks = (project.midiTracks as Track[]).map((track, i) => ({
      track,
      stem: decode(path.join(dir, `${String(i).padStart(2, "0")}.wav`)),
    }));
    // Room for the longest tail after the music stops.
    const frames =
      Math.max(...tracks.map((t) => t.stem.length / 2)) + SAMPLE_RATE * 4;
    const dry = new Float32Array(frames * 2);
    for (const { stem } of tracks) {
      for (let i = 0; i < stem.length; i++) {
        dry[i] += stem[i];
      }
    }
    const versions: Record<string, Float32Array> = { dry };
    for (const [name, reverb] of Object.entries(ENGINES)) {
      const bus = new Float32Array(frames);
      for (const { track, stem } of tracks) {
        const gain = 10 ** ((sendDb(track) - calibration[name]) / 20) / 2;
        for (let i = 0; i < stem.length / 2; i++) {
          bus[i] += (stem[2 * i] + stem[2 * i + 1]) * gain;
        }
      }
      const wet = interleave(...reverb(bus, SAMPLE_RATE));
      versions[name] = dry.map((v, i) => v + wet[i]);
    }
    // Every version at the target loudness, with one shared trim if any of
    // them would otherwise peak above -1 dBFS.
    const gains = Object.fromEntries(
      Object.entries(versions).map(([name, x]) => [
        name,
        TARGET_LUFS - measureLufs(x, scratch),
      ]),
    );
    let worstPeak = -Infinity;
    for (const [name, x] of Object.entries(versions)) {
      let peak = 0;
      for (const v of x) {
        peak = Math.max(peak, Math.abs(v));
      }
      worstPeak = Math.max(worstPeak, 20 * Math.log10(peak) + gains[name]);
    }
    const trim = Math.min(0, -1 - worstPeak);
    for (const [name, x] of Object.entries(versions)) {
      const k = 10 ** ((gains[name] + trim) / 20);
      const scaled = x.map((v) => v * k);
      writeFileSync(scratch, Buffer.from(scaled.buffer));
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-f",
        "f32le",
        "-ar",
        String(SAMPLE_RATE),
        "-ac",
        "2",
        "-i",
        scratch,
        "-b:a",
        "192k",
        path.join(outDir, "mp3", `${slugify(piece)}-${name}.mp3`),
      ]);
    }
    console.log(`${piece}: ${Object.keys(versions).join(", ")}`);
  }
}

main();
