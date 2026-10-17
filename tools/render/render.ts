// Render a toy-midi project offline with fluidsynth, mix the tracks with the
// project's gain, pan, mute, solo, and master gain, and report integrated
// loudness per track and for the mix.
//
// Usage:
//   tsx tools/render/render.ts project.json
//   tsx tools/render/render.ts 'https://.../draft#p=...' --out .tmp/render --mp3

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { inflateRawSync } from "node:zlib";
import type { SharedProject } from "../../src/lib/project-share.ts";
import {
  applyChannel,
  encodeMp3,
  measureLoudness,
  mixTracks,
  renderMidi,
} from "./audio.ts";
import { type Automation, encodeTrackMidi } from "./midi-file.ts";

const DEFAULT_SOUNDFONT = path.join(
  import.meta.dirname,
  "../../public/soundfonts/GeneralUserGS-2.0.3.sf3",
);

const TMP_DIR = path.join(import.meta.dirname, "../../.tmp");

const USAGE = `\
usage: tsx tools/render/render.ts <project.json | share-link | payload> [options]

options:
  --out <dir>      output directory (default .tmp/render/<title>)
  --sf2 <file>     SoundFont for tracks without their own (default the app's bundled font)
  --mp3            also write MP3 copies of each track and the mix
  -h, --help       show this help`;

/**
 * A project as a saved file or a share link holds it. Tracks may carry fields
 * the app doesn't play yet, for experiments that render outside the app.
 */
interface RenderProject extends Omit<SharedProject, "midiTracks"> {
  midiTracks?: RenderMidiTrack[];
}

type SharedMidiTrack = NonNullable<SharedProject["midiTracks"]>[number];

interface RenderMidiTrack extends SharedMidiTrack {
  automation?: Automation[];
  /** SoundFont that replaces `--sf2` for this track */
  sf2?: string;
  /** SoundFont generator number to an NRPN offset in -8192..8191 */
  nrpn?: Record<string, number>;
}

interface TrackReport {
  name: string;
  preset: string;
  noteCount: number;
  meanVelocity: number;
  gain: number;
  /** The track after gain and pan, absent when the track is silent */
  wavPath?: string;
  rawLoudness?: number;
  loudness?: number;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string" },
      sf2: { type: "string", default: DEFAULT_SOUNDFONT },
      mp3: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const input = positionals[0];
  if (!input) {
    throw new Error(USAGE);
  }

  const project = await loadProject(input);
  const tracks = project.midiTracks ?? [];
  const outDir = path.resolve(
    values.out ?? path.join(TMP_DIR, "render", toFileName(project.title)),
  );
  await mkdir(outDir, { recursive: true });

  // A muted track is silent, and any soloed track silences every track that
  // isn't soloed, as in the app's mixer.
  const anySoloed = tracks.some((track) => track.soloed);
  const isAudible = (track: RenderMidiTrack) =>
    !track.muted && (!anySoloed || track.soloed === true);

  // Render each audible track through its own channel strip, in parallel
  // since every fluidsynth process is independent.
  const reports = await Promise.all(
    tracks.map((track, index) =>
      renderTrack({
        track,
        audible: isAudible(track),
        basePath: path.join(
          outDir,
          `${String(index + 1).padStart(2, "0")}-${toFileName(track.name)}`,
        ),
        project,
        soundFont: values.sf2,
        mp3: values.mp3,
      }),
    ),
  );

  const trackPaths = reports.flatMap((report) =>
    report.wavPath ? [report.wavPath] : [],
  );
  if (trackPaths.length === 0) {
    throw new Error("The project has no audible MIDI notes to render.");
  }
  const mixPath = path.join(outDir, "00-mix.wav");
  await mixTracks({
    inputPaths: trackPaths,
    outputPath: mixPath,
    masterGain: project.masterGain ?? 1,
  });
  const mixLoudness = await measureLoudness(mixPath);
  if (values.mp3) {
    await encodeMp3({
      inputPath: mixPath,
      outputPath: mixPath.replace(/\.wav$/, ".mp3"),
    });
  }

  console.log(
    formatReport({
      project,
      soundFont: values.sf2,
      reports,
      mixLoudness,
      outDir,
    }),
  );
}

async function renderTrack({
  track,
  audible,
  basePath,
  project,
  soundFont,
  mp3,
}: {
  track: RenderMidiTrack;
  audible: boolean;
  basePath: string;
  project: RenderProject;
  soundFont: string;
  mp3: boolean;
}): Promise<TrackReport> {
  const report: TrackReport = {
    name: track.name,
    preset: `${track.bank ?? 0}/${track.program}`,
    noteCount: track.notes.length,
    meanVelocity:
      track.notes.reduce((sum, note) => sum + note.velocity, 0) /
      track.notes.length,
    gain: track.gain ?? 1,
  };
  if (!audible || track.notes.length === 0) {
    return report;
  }

  await writeFile(
    `${basePath}.mid`,
    encodeTrackMidi({
      tempo: project.tempo,
      timeSignature: project.timeSignature,
      bank: track.bank,
      program: track.program,
      nrpn: track.nrpn,
      notes: track.notes,
      automation: track.automation,
    }),
  );
  await renderMidi({
    midiPath: `${basePath}.mid`,
    wavPath: `${basePath}-raw.wav`,
    soundFont: track.sf2 ?? soundFont,
  });
  await applyChannel({
    inputPath: `${basePath}-raw.wav`,
    outputPath: `${basePath}.wav`,
    gain: report.gain,
    pan: track.pan ?? 0,
  });
  report.wavPath = `${basePath}.wav`;
  report.rawLoudness = await measureLoudness(`${basePath}-raw.wav`);
  report.loudness = await measureLoudness(report.wavPath);
  if (mp3) {
    await encodeMp3({
      inputPath: report.wavPath,
      outputPath: `${basePath}.mp3`,
    });
  }
  return report;
}

// A project file holds the project JSON. A share link carries it in the `p`
// fragment parameter, deflated and base64url-encoded, and a bare payload is
// that parameter's value.
async function loadProject(input: string): Promise<RenderProject> {
  if (existsSync(input)) {
    return JSON.parse(await readFile(input, "utf8"));
  }
  const payload = URL.canParse(input)
    ? (new URLSearchParams(new URL(input).hash.slice(1)).get("p") ?? "")
    : input;
  try {
    return JSON.parse(
      inflateRawSync(Buffer.from(payload, "base64url")).toString(),
    );
  } catch {
    throw new Error(
      `${input} is not a project file, a share link, or a share payload.`,
    );
  }
}

function formatReport({
  project,
  soundFont,
  reports,
  mixLoudness,
  outDir,
}: {
  project: RenderProject;
  soundFont: string;
  reports: TrackReport[];
  mixLoudness: number;
  outDir: string;
}): string {
  // Track loudness is measured before the master gain, so compare it with the
  // mix before the master gain too.
  const mixLoudnessBeforeMaster =
    mixLoudness - 20 * Math.log10(project.masterGain ?? 1);
  const rows = reports.map((report) => [
    report.name,
    report.preset,
    String(report.noteCount),
    formatNumber(report.meanVelocity, 0),
    formatNumber(20 * Math.log10(report.gain)),
    formatNumber(report.rawLoudness),
    report.wavPath ? formatNumber(report.loudness) : "silent",
    formatNumber(
      report.loudness === undefined
        ? undefined
        : report.loudness - mixLoudnessBeforeMaster,
    ),
  ]);
  return [
    `# ${project.title} (${project.tempo} BPM)`,
    "",
    `SoundFont: ${path.basename(soundFont)}, fluidsynth with reverb and chorus off. Mix: ${formatNumber(mixLoudness)} LUFS.`,
    "",
    "| Track | Preset (bank/program) | Notes | Mean velocity | Gain (dB) | LUFS before gain | LUFS | Δ vs mix (LU) |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map((row) => `| ${row.join(" | ")} |`),
    "",
    `Files: ${outDir}`,
  ].join("\n");
}

function formatNumber(value: number | undefined, digits = 1): string {
  return value !== undefined && Number.isFinite(value)
    ? value.toFixed(digits)
    : "–";
}

function toFileName(name: string): string {
  return name.replace(/[^\w-]+/g, "-").toLowerCase();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
