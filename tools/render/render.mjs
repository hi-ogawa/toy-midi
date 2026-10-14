// Render a toy-midi project offline and report per-track loudness: project JSON ->
// one .mid per track -> fluidsynth -> track gain and pan -> ffmpeg mix, with
// integrated LUFS per track and for the mix.
//
// Usage:
//   node tools/render/render.mjs <share-link | payload | project.json> [--out <dir>] [--sf2 <file>] [--mp3]
//
// Requires fluidsynth and ffmpeg on PATH. --sf2 defaults to
// ~/.local/share/soundfonts/GeneralUser-GS.sf2. Writes .mid/.wav files into --out
// (default ./out/<title>) and prints a Markdown table.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("--") && !isFlagValue(a));
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
function isFlagValue(a) {
  const i = args.indexOf(a);
  return i > 0 && ["--out", "--sf2"].includes(args[i - 1]);
}
if (!input) {
  console.error(
    "usage: node tools/render/render.mjs <share-link | payload | project.json> [--out dir] [--sf2 file] [--mp3]",
  );
  process.exit(1);
}

const sf2 = path.resolve(
  flag("--sf2") ??
    path.join(os.homedir(), ".local/share/soundfonts/GeneralUser-GS.sf2"),
);
const project = loadProject(input);
const slug = (project.title || "project")
  .replace(/[^\w-]+/g, "-")
  .toLowerCase();
const outDir = path.resolve(flag("--out") ?? path.join("out", slug));
fs.mkdirSync(outDir, { recursive: true });

// --- load ---

function loadProject(input) {
  if (fs.existsSync(input)) {
    return JSON.parse(fs.readFileSync(input, "utf8"));
  }
  const payload = input.includes("#p=") ? input.split("#p=")[1] : input;
  return JSON.parse(
    inflateRawSync(Buffer.from(payload, "base64url")).toString(),
  );
}

// --- minimal SMF writer (format 0, one channel) ---

const PPQ = 480;

function vlq(n) {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) {
    bytes.unshift((n & 0x7f) | 0x80);
  }
  return bytes;
}

// SoundFont NRPN (CC99=120, CC98=generator, data entry LSB then MSB): offsets a
// generator on the whole channel. `nrpn` maps generator number to an offset in
// -8192..8191, which fluidsynth multiplies by the generator's NRPN scale, such as
// 2 timecents per step for envelope times (38 = volume release).
function sf2Nrpn(ch, nrpn = {}) {
  return Object.entries(nrpn).flatMap(([gen, offset]) => {
    const v = Math.max(0, Math.min(16383, 8192 + offset));
    return [
      0,
      0xb0 | ch,
      99,
      120,
      0,
      0xb0 | ch,
      98,
      Number(gen),
      0,
      0xb0 | ch,
      38,
      v & 0x7f,
      0,
      0xb0 | ch,
      6,
      v >> 7,
    ];
  });
}

// Guitar articulations on a monophonic track, rendered with channel pitch bend.
// `art` on a note:
// - "h" or "p" (hammer-on or pull-off): no new note-on. The sounding note keeps
//   ringing, and the bend steps to this note's pitch.
// - "b" (bend): picked `bend` semitones below (default 2) and bent up to this
//   pitch over about 80 ms.
// - "r" (release): no new note-on, and the bend glides back to this pitch.
// Also `vib: cents` for vibrato on a held note, after a short delay.
// The bend range is set to ±12 semitones, and the bend resets before each new pick.
const BEND_RANGE = 12;
function expandArticulations(notes, tempo) {
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  if (!sorted.some((n) => n.art || n.vib)) {
    return { notes, bends: [] };
  }
  const beats = (ms) => (ms * tempo) / 60000;
  const out = [];
  const bends = []; // [beat, semitones]
  const ramp = (t0, from, to, ms) => {
    for (let i = 1; i <= 8; i++) {
      bends.push([t0 + (beats(ms) * i) / 8, from + ((to - from) * i) / 8]);
    }
  };
  let base;
  let bend = 0;
  for (const n of sorted) {
    if (base && ["h", "p", "r"].includes(n.art)) {
      base.duration = Math.max(
        base.duration,
        n.start + n.duration - base.start,
      );
      const to = n.pitch - base.pitch;
      if (n.art === "r") {
        ramp(n.start, bend, to, 60);
      } else {
        bends.push([n.start, to]);
      }
      bend = to;
      continue;
    }
    if (bend !== 0) {
      bends.push([n.start, 0]);
    }
    bend = 0;
    base = { ...n };
    delete base.art;
    out.push(base);
    if (n.art === "b") {
      const amount = n.bend ?? 2;
      base.pitch = n.pitch - amount;
      ramp(n.start + beats(15), 0, amount, 80);
      bend = amount;
    }
    if (n.vib) {
      const t0 = n.start + beats(120);
      const end = n.start + n.duration;
      for (let t = t0; t < end; t += beats(10)) {
        const r = Math.min(1, (t - t0) / beats(150));
        bends.push([
          t,
          bend +
            (n.vib / 100) *
              r *
              Math.sin((2 * Math.PI * 5.5 * (t - t0) * 60) / tempo),
        ]);
      }
      bends.push([end, bend]);
    }
  }
  return { notes: out, bends };
}

function writeMidi(file, { tempo, timeSignature, track }) {
  const drums = track.bank === 128;
  const ch = drums ? 9 : 0;
  const { notes, bends } = expandArticulations(track.notes, tempo);
  const events = []; // [tick, order, bytes]; order puts note-offs, then bends, before note-ons on the same tick
  for (const n of notes) {
    const on = Math.max(0, Math.round(n.start * PPQ)); // a negative delta would hang vlq()
    const off = Math.max(on + 1, Math.round((n.start + n.duration) * PPQ));
    events.push([on, 1, [0x90 | ch, n.pitch, n.velocity ?? 100]]);
    events.push([off, 0, [0x80 | ch, n.pitch, 0]]);
  }
  for (const [beat, semis] of bends) {
    const v = Math.max(
      0,
      Math.min(16383, Math.round(8192 + (semis / BEND_RANGE) * 8192)),
    );
    events.push([
      Math.max(0, Math.round(beat * PPQ)),
      0.5,
      [0xe0 | ch, v & 0x7f, v >> 7],
    ]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  // pitch bend range (RPN 0) before any notes
  const bendRange = bends.length
    ? [
        0,
        0xb0 | ch,
        101,
        0,
        0,
        0xb0 | ch,
        100,
        0,
        0,
        0xb0 | ch,
        6,
        BEND_RANGE,
        0,
        0xb0 | ch,
        38,
        0,
      ]
    : [];

  const usPerBeat = Math.round(60_000_000 / tempo);
  const denomPow = Math.log2(timeSignature?.denominator ?? 4);
  const head = [
    0,
    0xff,
    0x51,
    3,
    (usPerBeat >> 16) & 0xff,
    (usPerBeat >> 8) & 0xff,
    usPerBeat & 0xff,
    0,
    0xff,
    0x58,
    4,
    timeSignature?.numerator ?? 4,
    denomPow,
    24,
    8,
    ...(drums ? [] : [0, 0xb0 | ch, 0, track.bank ?? 0]),
    0,
    0xc0 | ch,
    track.program,
    ...sf2Nrpn(ch, track.nrpn),
    ...bendRange,
  ];
  const body = [];
  let last = 0;
  for (const [tick, , bytes] of events) {
    body.push(...vlq(tick - last), ...bytes);
    last = tick;
  }
  body.push(...vlq(PPQ * 2), 0xff, 0x2f, 0); // two beats of tail, then end of track

  const data = [...head, ...body];
  const u32 = (n) => [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ];
  fs.writeFileSync(
    file,
    Buffer.from([
      ...Buffer.from("MThd"),
      ...u32(6),
      0,
      0,
      0,
      1,
      (PPQ >> 8) & 0xff,
      PPQ & 0xff,
      ...Buffer.from("MTrk"),
      ...u32(data.length),
      ...data,
    ]),
  );
}

// --- render and measure ---

const run = (cmd, argv) =>
  execFileSync(cmd, argv, { stdio: ["ignore", "pipe", "pipe"] });

function render(mid, wav, font = sf2) {
  run("fluidsynth", [
    "-ni",
    "-q",
    "-g",
    "0.5",
    "-r",
    "48000",
    "-F",
    wav,
    font,
    mid,
  ]);
}

// Gain, then a stereo pan that matches Web Audio's StereoPannerNode on stereo input.
function applyGain(src, dst, gain, pan = 0) {
  const x = pan <= 0 ? pan + 1 : pan;
  const a = Math.cos((x * Math.PI) / 2);
  const b = Math.sin((x * Math.PI) / 2);
  const panFilter =
    pan <= 0
      ? `pan=stereo|c0=c0+${a}*c1|c1=${b}*c1`
      : `pan=stereo|c0=${a}*c0|c1=c1+${b}*c0`;
  run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    src,
    "-af",
    `volume=${gain},${panFilter}`,
    dst,
  ]);
}

// ebur128 prints its summary on stderr
function measure(wav) {
  const { stderr } = spawnSync(
    "ffmpeg",
    ["-nostats", "-i", wav, "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
    {
      encoding: "utf8",
    },
  );
  const m = stderr.match(
    /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+|-inf)\s*LUFS/,
  );
  return m ? Number(m[1]) : NaN;
}

const db = (g) => (g > 0 ? 20 * Math.log10(g) : -Infinity);
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "–");

const rows = [];
const gained = [];
project.midiTracks.forEach((track, i) => {
  const id = String(i + 1).padStart(2, "0");
  const base = path.join(
    outDir,
    `${id}-${track.name.replace(/[^\w-]+/g, "-").toLowerCase()}`,
  );
  const gain = track.gain ?? 1;
  const notes = track.notes ?? [];
  const row = {
    name: track.name,
    preset: `${track.bank ?? 0}/${track.program}`,
    notes: notes.length,
    velocity: notes.length
      ? notes.reduce((s, n) => s + (n.velocity ?? 100), 0) / notes.length
      : NaN,
    gainDb: db(gain),
    muted: !!track.muted,
  };
  rows.push(row);
  if (track.muted || notes.length === 0) {
    return;
  }
  writeMidi(`${base}.mid`, {
    tempo: project.tempo,
    timeSignature: project.timeSignature,
    track,
  });
  render(`${base}.mid`, `${base}-raw.wav`, track.sf2 ?? sf2);
  applyGain(`${base}-raw.wav`, `${base}.wav`, gain, track.pan ?? 0);
  row.rawLufs = measure(`${base}-raw.wav`);
  row.lufs = measure(`${base}.wav`);
  gained.push(`${base}.wav`);
  if (args.includes("--mp3")) {
    run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-i",
      `${base}.wav`,
      "-b:a",
      "192k",
      `${base}.mp3`,
    ]);
  }
});

const mixWav = path.join(outDir, "00-mix.wav");
run("ffmpeg", [
  "-y",
  "-v",
  "error",
  ...gained.flatMap((f) => ["-i", f]),
  "-filter_complex",
  `amix=inputs=${gained.length}:normalize=0:duration=longest`,
  mixWav,
]);
const mixLufs = measure(mixWav);
if (args.includes("--mp3")) {
  run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    mixWav,
    "-b:a",
    "192k",
    mixWav.replace(/\.wav$/, ".mp3"),
  ]);
}

console.log(`# ${project.title} (${project.tempo} BPM)\n`);
console.log(
  `SoundFont: ${path.basename(sf2)}, fluidsynth with reverb and chorus off. Mix: ${fmt(mixLufs)} LUFS.\n`,
);
console.log(
  "| Track | Preset (bank/program) | Notes | Mean velocity | Gain (dB) | LUFS before gain | LUFS | Δ vs mix (LU) |",
);
console.log("|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  const lufsCell = r.muted ? "muted" : fmt(r.lufs);
  console.log(
    `| ${r.name} | ${r.preset} | ${r.notes} | ${fmt(r.velocity, 0)} | ${fmt(r.gainDb)} | ${fmt(r.rawLufs)} | ${lufsCell} | ${fmt(r.lufs - mixLufs)} |`,
  );
}
console.log(`\nFiles: ${outDir}`);
