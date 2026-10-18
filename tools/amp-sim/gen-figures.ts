// Draw the figures in images/ for README.md: a chain diagram per step, the
// drive's curves and what they do to a sine, and plots from amp-sim.ts renders,
// which are its per-track 16-bit mono WAVs.
//
// Usage:
//   tsx tools/amp-sim/gen-figures.ts --held-note <dir> --riff <dir> --riff-project <project.json>
//
// --held-note is the --out of held-note.json rendered with the tags v1 and v2.
// --riff is the --out of Open E Mixolydian, from --riff-project, rendered with
// the tags v2, v2-gate-filtercab, v2-gate-nocab, and v2-ir-gate.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const USAGE = `\
usage: tsx tools/amp-sim/gen-figures.ts --held-note <dir> --riff <dir> --riff-project <project.json>`;

const OUT_DIR = path.join(import.meta.dirname, "images");

type StageState = "off" | "on" | "new";

type Series = {
  label: string;
  color: string;
  points: [number, number][];
};

async function main() {
  const { values } = parseArgs({
    options: {
      "held-note": { type: "string" },
      riff: { type: "string" },
      "riff-project": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const heldNote = values["held-note"];
  const riff = values.riff;
  const riffProject = values["riff-project"];
  if (!heldNote || !riff || !riffProject) {
    throw new Error(USAGE);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Draw the chain once per step, with the step's stages highlighted.
  const all = {
    gate: "on",
    pre: "on",
    comp: "on",
    drive: "on",
    cab: "on",
    room: "on",
  } as const;
  drawChain({ file: "chain-final.svg", title: "Final chain", state: all });
  drawChain({ file: "chain-1-dry.svg", title: "Step 1: no amp", state: {} });
  drawChain({
    file: "chain-2-v1.svg",
    title: "Step 2: drive (v1)",
    state: { pre: "new", drive: "new", cab: "new" },
    notes: { drive: "one tanh stage, fixed boost" },
  });
  drawChain({
    file: "chain-3-v2.svg",
    title: "Step 3: sustain (v2)",
    state: { pre: "on", comp: "new", drive: "new", cab: "on" },
    notes: { drive: "asymmetric, then cascaded" },
  });
  drawChain({
    file: "chain-4-gate.svg",
    title: "Step 4: note gate",
    state: { gate: "new", pre: "on", comp: "on", drive: "on", cab: "on" },
  });
  drawChain({
    file: "chain-5-room.svg",
    title: "Step 5: room",
    state: { ...all, room: "new" },
  });
  drawChain({
    file: "chain-6-cab.svg",
    title: "Step 6: cabinet",
    state: { gate: "on", pre: "on", comp: "on", drive: "on", cab: "new" },
    notes: { cab: "none · filters · IR" },
  });

  // Plot the drive from its formulas, then the measured effect of the sustain,
  // the gate, and the cabinet.
  plotTanh();
  plotDriveShift();
  plotDriveCurves();
  plotDriveWaves();
  plotDriveHarmonics();
  plotSustain(heldNote);
  plotGate({ riff, riffProject });
  plotCabinet(riff);
}

// --- chain diagrams -------------------------------------------------------------

const STAGES = [
  { key: "gate", name: "Note gate", what: "closes 30 ms after note-off" },
  { key: "pre", name: "Pre-EQ", what: "low cut, 750 Hz boost" },
  { key: "comp", name: "Compressor", what: "holds a decaying note up" },
  { key: "drive", name: "Drive", what: "tanh clipping, 4× oversampled" },
  { key: "cab", name: "Cabinet", what: "roll-off from ~5 kHz" },
  { key: "room", name: "Room", what: "early reflections 19–47 ms" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

function drawChain({
  file,
  title,
  state,
  notes = {},
}: {
  file: string;
  title: string;
  state: Partial<Record<StageKey, StageState>>;
  notes?: Partial<Record<StageKey, string>>;
}) {
  const w = 150;
  const h = 74;
  const gap = 22;
  const x0 = 70;
  const y0 = 44;
  const width = x0 + STAGES.length * (w + gap) + 60;
  const height = 150;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">`;
  s += `<rect width="100%" height="100%" fill="white"/>`;
  s += `<text x="10" y="24" font-size="15" font-weight="bold">${title}</text>`;
  s += `<text x="10" y="${y0 + h / 2 + 5}" font-size="13">DI →</text>`;
  STAGES.forEach((stage, i) => {
    const x = x0 + i * (w + gap);
    const v = state[stage.key] ?? "off";
    const fill = v === "new" ? "#ffe08a" : v === "on" ? "#e8eef7" : "white";
    const stroke = v === "off" ? "#bbb" : v === "new" ? "#c08a00" : "#5b7db1";
    const dash = v === "off" ? ` stroke-dasharray="5 4"` : "";
    const color = v === "off" ? "#aaa" : "#222";
    s += `<rect x="${x}" y="${y0}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="2"${dash}/>`;
    s += `<text x="${x + w / 2}" y="${y0 + 28}" font-size="14" font-weight="bold" text-anchor="middle" fill="${color}">${stage.name}</text>`;
    const sub = notes[stage.key] ?? (v === "off" ? "—" : stage.what);
    s += `<text x="${x + w / 2}" y="${y0 + 50}" font-size="11.5" text-anchor="middle" fill="${color}">${sub}</text>`;
    if (i < STAGES.length - 1) {
      s += `<text x="${x + w + gap / 2}" y="${y0 + h / 2 + 5}" font-size="14" text-anchor="middle" fill="#888">→</text>`;
    }
  });
  const xe = x0 + STAGES.length * (w + gap) - gap + 8;
  s += `<text x="${xe}" y="${y0 + h / 2 + 5}" font-size="13">→ out</text>`;
  s += `<text x="10" y="${height - 12}" font-size="11.5" fill="#666">yellow: added or changed in this step · blue: already there · dashed: not in the chain</text>`;
  s += `</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, file), s);
}

// --- plots ------------------------------------------------------------------------

// The drive section: the clipper stages of amp-sim.ts's AMPS as formulas,
// without the filters between stages, which barely change a low sine.
const DC_OFFSET = 0.15;

// A quiet input, such as a note decaying or a soft stroke, where the drives
// still differ. At a stroke's peak, near 0.3 to 0.6, all of them are nearly
// square.
const QUIET_INPUT = 0.05;

function dbToGain(db: number) {
  return 10 ** (db / 20);
}

// tanh(x + 0.15), shifted back down by tanh(0.15) as the high-pass after it
// does, so silence stays silent.
function asymmetricTanh(x: number) {
  return Math.tanh(x + DC_OFFSET) - Math.tanh(DC_OFFSET);
}

// The drive the renders settled on, at its two gain levels.
const DRIVES = [
  {
    label: "crunch: two stages",
    color: "#2c6fbb",
    apply: (x: number) =>
      Math.tanh(dbToGain(6) * asymmetricTanh(dbToGain(18) * x)),
  },
  {
    label: "high gain: three stages",
    color: "#8e44ad",
    apply: (x: number) =>
      Math.tanh(
        dbToGain(10) *
          Math.tanh(dbToGain(14) * asymmetricTanh(dbToGain(18) * x)),
      ),
  },
];

// Crunch without the shift in its first stage, to show the even harmonics
// come from the shift.
const SYMMETRIC_CRUNCH = {
  label: "crunch without the shift",
  color: "#bbb",
  apply: (x: number) => Math.tanh(dbToGain(6) * Math.tanh(dbToGain(18) * x)),
};

// The clipper on its own, without and with the shift, against y = x.
function plotTanh() {
  const xs = Array.from({ length: 301 }, (_, i) => -3 + i * 0.02);
  drawPlot({
    file: "drive-tanh.svg",
    title: "The clipper: tanh follows y = x near 0 and flattens toward ±1",
    xLabel: "input sample",
    yLabel: "output sample",
    xMap: (x) => (x + 3) / 6,
    xTicks: [-3, -2, -1, 0, 1, 2, 3].map((x) => [x, String(x)]),
    yRange: [-1.5, 1.5],
    yTicks: [-1, -0.5, 0, 0.5, 1],
    legendAt: "left",
    series: [
      {
        label: "y = x",
        color: "#999",
        // Only where it stays inside the plot.
        points: xs.filter((x) => Math.abs(x) <= 1.5).map((x) => [x, x]),
      },
      {
        label: "tanh(x)",
        color: "#bbb",
        points: xs.map((x) => [x, Math.tanh(x)]),
      },
      {
        label: "tanh(x + 0.15) − tanh(0.15)",
        color: "#2c6fbb",
        points: xs.map((x) => [x, asymmetricTanh(x)]),
      },
    ],
  });
}

// Input level against output level for each drive, over the range of the
// guitar tracks' peaks.
function plotDriveCurves() {
  const xs = Array.from({ length: 301 }, (_, i) => -0.15 + i * 0.001);
  drawPlot({
    file: "drive-curves.svg",
    title: "Drive curves: the louder the input, the flatter the output",
    xLabel: "input sample (stroke peaks go on to ±0.3 to ±0.6)",
    yLabel: "output sample",
    xMap: (x) => (x + 0.15) / 0.3,
    xTicks: [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15].map((x) => [x, String(x)]),
    legendAt: "left",
    yRange: [-1.1, 1.1],
    yTicks: [-1, -0.5, 0, 0.5, 1],
    series: [
      {
        label: "no drive: y = x",
        color: "#999",
        points: xs.map((x) => [x, x]),
      },
      ...DRIVES.map(
        ({ label, color, apply }): Series => ({
          label,
          color,
          points: xs.map((x) => [x, apply(x)]),
        }),
      ),
    ],
  });
}

// Two cycles of a sine at the muted strokes' peak through each drive. The
// asymmetric drives clip the top harder than the bottom, and their outputs
// are centered as the high-pass after the offset leaves them.
function plotDriveWaves() {
  const n = 400;
  const input = Array.from(
    { length: n + 1 },
    (_, i) => QUIET_INPUT * Math.sin((4 * Math.PI * i) / n),
  );
  drawPlot({
    file: "drive-waves.svg",
    title: `A quiet sine (${QUIET_INPUT}): crunch rounds it, high gain squares it`,
    xLabel: "two cycles",
    yLabel: "sample",
    xMap: (i) => i / n,
    xTicks: [],
    yRange: [-1.1, 1.9],
    yTicks: [-1, -0.5, 0, 0.5, 1],
    series: [
      {
        label: "input",
        color: "#999",
        points: input.map((x, i) => [i, x]),
      },
      ...DRIVES.map(({ label, color, apply }): Series => {
        const out = input.map(apply);
        const mean = out.slice(0, n).reduce((a, b) => a + b) / n;
        return { label, color, points: out.map((y, i) => [i, y - mean]) };
      }),
    ],
  });
}

// One crunch first stage on a sine, without and with the shift. Without it,
// the top and bottom come out alike. With it, the top flattens more than the
// bottom.
function plotDriveShift() {
  const n = 400;
  const gain = dbToGain(18);
  const input = Array.from(
    { length: n + 1 },
    (_, i) => 0.2 * Math.sin((4 * Math.PI * i) / n),
  );
  drawPlot({
    file: "drive-shift.svg",
    title:
      "One stage on a sine (0.2): the shift flattens the top more than the bottom",
    xLabel: "two cycles",
    yLabel: "sample",
    xMap: (i) => i / n,
    xTicks: [],
    yRange: [-1.7, 2.4],
    yTicks: [-1.5, -1, -0.5, 0, 0.5, 1, 1.5],
    series: [
      {
        label: "7.9x, the gain alone without clipping",
        color: "#ddd",
        points: input.map((x, i) => [i, gain * x]),
      },
      {
        label: "tanh(7.9x)",
        color: "#bbb",
        points: input.map((x, i) => [i, Math.tanh(gain * x)]),
      },
      {
        label: "tanh(7.9x + 0.15) − tanh(0.15)",
        color: "#2c6fbb",
        points: input.map((x, i) => [i, asymmetricTanh(gain * x)]),
      },
    ],
  });
}

// The first ten harmonics of the waves above, relative to the fundamental.
// Without the shift a drive adds only odd harmonics, with it also even ones.
function plotDriveHarmonics() {
  const n = 4096;
  const cycles = 8;
  const groups = [SYMMETRIC_CRUNCH, ...DRIVES].map(
    ({ label, color, apply }) => {
      const out = Array.from({ length: n }, (_, i) =>
        apply(QUIET_INPUT * Math.sin((2 * Math.PI * cycles * i) / n)),
      );
      const amplitude = (k: number) => {
        let re = 0;
        let im = 0;
        for (let i = 0; i < n; i++) {
          re += out[i]! * Math.cos((2 * Math.PI * cycles * k * i) / n);
          im += out[i]! * Math.sin((2 * Math.PI * cycles * k * i) / n);
        }
        return Math.hypot(re, im);
      };
      const fundamental = amplitude(1);
      const levels = Array.from({ length: 10 }, (_, i) =>
        Math.max(-80, 20 * Math.log10(amplitude(i + 1) / fundamental)),
      );
      return { label, color, levels };
    },
  );
  drawBars({
    file: "drive-harmonics.svg",
    title:
      "Harmonics of the quiet sine: even ones (2, 4, 6…) come from the shift",
    xLabel: "harmonic (1 is the note itself)",
    yLabel: "level (dB, from harmonic 1)",
    yRange: [-80, 25],
    yTicks: [0, -20, -40, -60, -80],
    groups,
  });
}

function drawBars({
  file,
  title,
  width = 760,
  height = 300,
  xLabel,
  yLabel,
  yRange,
  yTicks,
  groups,
}: {
  file: string;
  title: string;
  width?: number;
  height?: number;
  xLabel: string;
  yLabel: string;
  yRange: [number, number];
  yTicks: number[];
  groups: { label: string; color: string; levels: number[] }[];
}) {
  const L = 60;
  const R = 20;
  const T = 40;
  const B = 46;
  const pw = width - L - R;
  const ph = height - T - B;
  const Y = (v: number) =>
    T + (1 - (v - yRange[0]) / (yRange[1] - yRange[0])) * ph;
  const count = groups[0]!.levels.length;
  const slot = pw / count;
  const bar = (slot * 0.7) / groups.length;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">`;
  s += `<rect width="100%" height="100%" fill="white"/>`;
  s += `<text x="${L}" y="22" font-size="14" font-weight="bold">${title}</text>`;
  for (const t of yTicks) {
    s += `<line x1="${L}" x2="${L + pw}" y1="${Y(t)}" y2="${Y(t)}" stroke="#eee"/>`;
    s += `<text x="${L - 6}" y="${Y(t) + 4}" font-size="11" text-anchor="end" fill="#555">${t}</text>`;
  }
  for (let k = 0; k < count; k++) {
    const x0 = L + k * slot + slot * 0.15;
    groups.forEach(({ color, levels }, g) => {
      const y = Y(levels[k]!);
      s += `<rect x="${(x0 + g * bar).toFixed(1)}" y="${y.toFixed(1)}" width="${bar.toFixed(1)}" height="${(Y(yRange[0]) - y).toFixed(1)}" fill="${color}"/>`;
    });
    s += `<text x="${L + (k + 0.5) * slot}" y="${T + ph + 16}" font-size="11" text-anchor="middle" fill="#555">${k + 1}</text>`;
  }
  s += `<rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="none" stroke="#999"/>`;
  s += `<text x="${L + pw / 2}" y="${height - 8}" font-size="12" text-anchor="middle">${xLabel}</text>`;
  s += `<text x="14" y="${T + ph / 2}" font-size="12" text-anchor="middle" transform="rotate(-90 14 ${T + ph / 2})">${yLabel}</text>`;
  groups.forEach(({ label, color }, i) => {
    s += `<rect x="${L + pw - 250}" y="${T + 10 + i * 18}" width="14" height="8" fill="${color}"/>`;
    s += `<text x="${L + pw - 230}" y="${T + 18 + i * 18}" font-size="12">${label}</text>`;
  });
  s += `</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, file), s);
}

// Step 2 → 3: held-note.json's E3 through high gain, v1 against v2, each
// relative to its own attack. The note starts at 8 s (beat 8 at 60 BPM) and
// is held for 6 s.
function plotSustain(dir: string) {
  const variants = [
    ["v1", "v1: fixed drive", "#c0392b"],
    ["v2", "v2: compressor in front", "#2c6fbb"],
  ] as const;
  const series = variants.map(([tag, label, color]): Series => {
    const { x, rate } = readWav(`${dir}/${tag}/01-high-gain-raw-amp.wav`);
    const env = measureEnvelope({ x, rate, from: 8, to: 14, window: 0.05 });
    const ref = Math.max(...env.slice(0, 10));
    return { label, color, points: env.map((v, i) => [i * 0.05, v - ref]) };
  });
  drawPlot({
    file: "sustain.svg",
    title:
      "A held note through high gain: v1 cleans up as the string decays, v2 holds",
    xLabel: "seconds after the pick",
    yLabel: "level (dB, from the attack)",
    xMap: (t) => t / 6,
    xTicks: [0, 1, 2, 3, 4, 5, 6].map((t) => [t, String(t)]),
    yRange: [-25, 3],
    yTicks: [0, -5, -10, -15, -20, -25],
    series,
  });
}

// Step 3 → 4: two bars of Open E Mixolydian's muted riff track, without and
// with the note gate, with the notes shaded.
function plotGate({
  riff,
  riffProject,
}: {
  riff: string;
  riffProject: string;
}) {
  const project: {
    tempo: number;
    midiTracks: { notes: { start: number; duration: number }[] }[];
  } = JSON.parse(fs.readFileSync(riffProject, "utf8"));
  const track = project.midiTracks[1]!;
  const spb = 60 / project.tempo;
  const from = 4 * 4 * spb;
  const to = from + 8 * spb;
  const shade = track.notes
    .map((n) => [n.start * spb, (n.start + n.duration) * spb] as const)
    .filter(([a, b]) => b > from && a < to)
    .map(([a, b]): [number, number] => [
      Math.max(a, from) - from,
      Math.min(b, to) - from,
    ]);
  const panels = [
    ["v2", "v2, no gate", "#c0392b", "gate-off.svg"],
    ["v2-gate-filtercab", "v2 with the note gate", "#2c6fbb", "gate-on.svg"],
  ] as const;
  for (const [tag, label, color, file] of panels) {
    const { x, rate } = readWav(
      `${riff}/${tag}/02-crunch-l-riff-muted--raw-amp.wav`,
    );
    const env = measureEnvelope({ x, rate, from, to, window: 0.005 });
    const ref = Math.max(...env);
    drawPlot({
      file,
      title: `${label}: muted riff, bars 5–6 (green = note held)`,
      height: 240,
      xLabel: "beat in the bar",
      yLabel: "level (dB)",
      xMap: (t) => t / (to - from),
      xTicks: Array.from({ length: 9 }, (_, b) => [
        b * spb,
        b === 8 ? "" : String((b % 4) + 1),
      ]),
      yRange: [-70, 2],
      yTicks: [0, -20, -40, -60],
      shade,
      series: [
        { label, color, points: env.map((v, k) => [k * 0.005, v - ref]) },
      ],
      legend: false,
    });
  }
}

// Step 6: the riff's open-stroke track with no cabinet, the filter cabinet,
// and the Marshall IR, as average spectra.
function plotCabinet(riff: string) {
  const variants = [
    ["v2-gate-nocab", "amp", "no cabinet", "#c0392b"],
    ["v2-gate-filtercab", "amp", "filter cabinet", "#2c6fbb"],
    ["v2-ir-gate", "cab", "Marshall IR", "#27ae60"],
  ] as const;
  const lo = Math.log10(60);
  const hi = Math.log10(20000);
  const series = variants.map(([tag, stage, label, color]): Series => {
    const { x, rate } = readWav(
      `${riff}/${tag}/01-crunch-l-riff-open--raw-${stage}.wav`,
    );
    const db = measureSpectrum(x);
    const n = db.length * 2;
    const points: [number, number][] = [];
    // Smooth over a sixth of an octave so the curves are readable.
    for (let f = 60; f <= 20000; f *= 2 ** (1 / 24)) {
      const k0 = Math.floor((f / 2 ** (1 / 12) / rate) * n);
      const k1 = Math.ceil(((f * 2 ** (1 / 12)) / rate) * n);
      let power = 0;
      let count = 0;
      for (let k = Math.max(1, k0); k <= Math.min(db.length - 1, k1); k++) {
        power += 10 ** (db[k]! / 10);
        count++;
      }
      points.push([f, 10 * Math.log10(power / count)]);
    }
    return { label, color, points };
  });
  const top = Math.max(...series.flatMap((s) => s.points.map((p) => p[1])));
  for (const s of series) {
    s.points = s.points.map(([f, v]) => [f, v - top]);
  }
  drawPlot({
    file: "cabinet.svg",
    title:
      "Open riff spectrum: without a cabinet, the clipping's harmonics above ~5 kHz stay",
    xLabel: "frequency (Hz)",
    yLabel: "level (dB, relative)",
    xMap: (f) => (Math.log10(f) - lo) / (hi - lo),
    xTicks: [
      [100, "100"],
      [300, "300"],
      [1000, "1k"],
      [3000, "3k"],
      [5000, "5k"],
      [10000, "10k"],
      [20000, "20k"],
    ],
    yRange: [-70, 2],
    yTicks: [0, -20, -40, -60],
    series,
  });
}

function drawPlot({
  file,
  title,
  width = 760,
  height = 300,
  xLabel,
  yLabel,
  xTicks,
  yTicks,
  xMap,
  yRange,
  series,
  shade = [],
  legend = true,
  legendAt = "right",
}: {
  file: string;
  title: string;
  width?: number;
  height?: number;
  xLabel: string;
  yLabel: string;
  xTicks: [number, string][];
  yTicks: number[];
  xMap: (value: number) => number;
  yRange: [number, number];
  series: Series[];
  shade?: [number, number][];
  legend?: boolean;
  legendAt?: "left" | "right";
}) {
  const L = 60;
  const R = 20;
  const T = 40;
  const B = 46;
  const pw = width - L - R;
  const ph = height - T - B;
  const X = (v: number) => L + xMap(v) * pw;
  const Y = (v: number) =>
    T + (1 - (v - yRange[0]) / (yRange[1] - yRange[0])) * ph;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">`;
  s += `<rect width="100%" height="100%" fill="white"/>`;
  s += `<text x="${L}" y="22" font-size="14" font-weight="bold">${title}</text>`;
  for (const [a, b] of shade) {
    s += `<rect x="${X(a)}" y="${T}" width="${Math.max(1, X(b) - X(a))}" height="${ph}" fill="#e6efe6"/>`;
  }
  for (const t of yTicks) {
    s += `<line x1="${L}" x2="${L + pw}" y1="${Y(t)}" y2="${Y(t)}" stroke="#eee"/>`;
    s += `<text x="${L - 6}" y="${Y(t) + 4}" font-size="11" text-anchor="end" fill="#555">${t}</text>`;
  }
  for (const [v, label] of xTicks) {
    s += `<line x1="${X(v)}" x2="${X(v)}" y1="${T}" y2="${T + ph}" stroke="#eee"/>`;
    s += `<text x="${X(v)}" y="${T + ph + 16}" font-size="11" text-anchor="middle" fill="#555">${label}</text>`;
  }
  s += `<rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="none" stroke="#999"/>`;
  s += `<text x="${L + pw / 2}" y="${height - 8}" font-size="12" text-anchor="middle">${xLabel}</text>`;
  s += `<text x="14" y="${T + ph / 2}" font-size="12" text-anchor="middle" transform="rotate(-90 14 ${T + ph / 2})">${yLabel}</text>`;
  series.forEach((line, i) => {
    const points = line.points
      .map(
        ([a, b]) =>
          `${X(a).toFixed(1)},${Y(Math.max(yRange[0], Math.min(yRange[1], b))).toFixed(1)}`,
      )
      .join(" ");
    s += `<polyline points="${points}" fill="none" stroke="${line.color}" stroke-width="1.6"/>`;
    if (legend) {
      const x = legendAt === "left" ? L + 12 : L + pw - 220;
      s += `<rect x="${x}" y="${T + 10 + i * 18}" width="14" height="4" fill="${line.color}"/>`;
      s += `<text x="${x + 20}" y="${T + 16 + i * 18}" font-size="12">${line.label}</text>`;
    }
  });
  s += `</svg>`;
  fs.writeFileSync(path.join(OUT_DIR, file), s);
}

// --- analysis ---------------------------------------------------------------------

function readWav(file: string) {
  const b = fs.readFileSync(file);
  let rate = 0;
  let channels = 1;
  let data: Buffer | undefined;
  for (let p = 12; p < b.length; ) {
    const id = b.toString("ascii", p, p + 4);
    const size = b.readUInt32LE(p + 4);
    if (id === "fmt ") {
      channels = b.readUInt16LE(p + 10);
      rate = b.readUInt32LE(p + 12);
    } else if (id === "data") {
      data = b.subarray(p + 8, p + 8 + size);
    }
    p += 8 + size + (size % 2);
  }
  if (!data) {
    throw new Error(`${file} has no audio data`);
  }
  const n = data.length / 2 / channels;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let c = 0; c < channels; c++) {
      v += data.readInt16LE((i * channels + c) * 2);
    }
    x[i] = v / channels / 32768;
  }
  return { x, rate };
}

// RMS level in dB per window.
function measureEnvelope({
  x,
  rate,
  from,
  to,
  window,
}: {
  x: Float32Array;
  rate: number;
  from: number;
  to: number;
  window: number;
}) {
  const size = Math.round(window * rate);
  const out: number[] = [];
  const end = Math.min(x.length, to * rate);
  for (let s = Math.round(from * rate); s + size <= end; s += size) {
    let energy = 0;
    for (let i = s; i < s + size; i++) {
      energy += x[i]! * x[i]!;
    }
    out.push(10 * Math.log10(energy / size + 1e-20));
  }
  return out;
}

// Average power spectrum in dB, normalized so total power is 0 dB.
function measureSpectrum(x: Float32Array, n = 4096) {
  const power = new Float64Array(n / 2);
  for (let s = 0; s + n <= x.length; s += n) {
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      // Hann window
      re[i] = x[s + i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
    }
    transformFourier(re, im);
    for (let k = 0; k < n / 2; k++) {
      power[k]! += re[k]! * re[k]! + im[k]! * im[k]!;
    }
  }
  const total = power.reduce((a, b) => a + b, 0);
  return Array.from(power, (p) => 10 * Math.log10(p / total + 1e-20));
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
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(angle * k);
        const s = Math.sin(angle * k);
        const a = i + k;
        const b = i + k + len / 2;
        const vr = re[b]! * c - im[b]! * s;
        const vi = re[b]! * s + im[b]! * c;
        const ur = re[a]!;
        const ui = im[a]!;
        re[a] = ur + vr;
        im[a] = ui + vi;
        re[b] = ur - vr;
        im[b] = ui - vi;
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
