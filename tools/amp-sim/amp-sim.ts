// Offline amp sim prototype for guitar tracks, ahead of an amp sim in the app
// (#934). It renders each MIDI track of a project dry with fluidsynth on the
// track's SoundFont, runs each guitar track through the amp setting its name
// starts with (Clean, Crunch, High Gain), and remixes. Each run writes one
// variant as `<tag>.mp3` and `<tag>-guitars.mp3` with the guitars soloed, both
// loudness-normalized so an A/B compares tone, not level. README.md explains
// the chain.
//
// Usage:
//   tsx tools/amp-sim/amp-sim.ts <project.json> --out <dir> --tag <name> [options]

import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseArgs, promisify } from "node:util";
import {
  audioToWav,
  BasicMIDI,
  SoundBankLoader,
  SpessaSynthProcessor,
  SpessaSynthSequencer,
} from "spessasynth_core";
import { exportMidi } from "../../src/lib/midi-export.ts";
import { deserializeEditorRuntimeState } from "../../src/lib/persistence.ts";
import { convertSharedProject } from "../../src/lib/project-share.ts";
import type { MidiTrackState } from "../../src/lib/runtime.ts";
import {
  findSoundfont,
  GENERAL_USER_SOUNDFONT,
} from "../../src/lib/soundfonts.ts";

const USAGE = `\
usage: tsx tools/amp-sim/amp-sim.ts <project.json> --out <dir> --tag <name> [options]

<project.json> is a SharedProject .json file.

Options:
  --amp none|v1|v2   Amp for the guitar tracks (default v2)
  --note-gate        Gate each guitar track's input by its note-offs
  --ir <cabinet.wav> Convolve with a cabinet impulse response instead of filters
  --no-cab           Leave out the cabinet
  --no-comp          Leave out v2's compressor
  --room             Add a short room after the amp
  --gm               Play the guitar tracks on General MIDI's guitars instead
  --synth fluidsynth|spessasynth
                     Synth for the dry tracks (default fluidsynth)

Run \`pnpm fetch-soundfonts\` first. fluidsynth, ffmpeg, and ffprobe must be on
PATH.`;

type Options = NonNullable<ReturnType<typeof parseCliOptions>>;

type GainLevel = keyof typeof GM_PROGRAMS;

type AmpName = keyof typeof AMPS;

const execFileAsync = promisify(execFile);

const MIX_LUFS = -16;

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  if (!options) {
    console.log(USAGE);
    return;
  }

  // Load the project as the app does, and for the General MIDI baseline, swap
  // the guitar tracks onto General MIDI's guitars.
  const { tempo, midiTracks } = readProject(options.input);
  if (options.gm) {
    for (const track of midiTracks) {
      const gain = findGainLevel(track);
      if (gain) {
        track.program = track.program === 1 ? 28 : GM_PROGRAMS[gain];
        delete track.soundfont;
      }
    }
  }

  // Export each track as MIDI and render it dry on its SoundFont.
  const renderDir = await renderDryTracks({ tempo, midiTracks, options });
  const workDir = path.join(options.out, options.tag);
  fs.mkdirSync(workDir, { recursive: true });

  // Run each guitar track through the amp, and give every track its gain and
  // pan.
  const tracks = await Promise.all(
    midiTracks.map(async (track, index) => {
      const raw = getDryTrackPath({ renderDir, index, track });
      const gain = findGainLevel(track);
      const guitar = Boolean(gain);
      if (gain && !options.gm && options.amp !== "none") {
        const file = await runAmp({
          track,
          gain,
          amp: options.amp,
          raw,
          workDir,
          tempo,
          options,
        });
        return { file, guitar };
      }
      const file = path.join(workDir, `${path.basename(raw, ".wav")}-out.wav`);
      await runFfmpeg(["-i", raw, "-af", buildChannelFilter(track), file]);
      return { file, guitar };
    }),
  );

  // Mix the full arrangement and the guitars alone, each loudness-normalized.
  await mixTracks(
    tracks.map((t) => t.file),
    path.join(options.out, `${options.tag}.mp3`),
  );
  await mixTracks(
    tracks.filter((t) => t.guitar).map((t) => t.file),
    path.join(options.out, `${options.tag}-guitars.mp3`),
  );
}

function parseCliOptions(args: string[]) {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      out: { type: "string" },
      tag: { type: "string" },
      amp: { type: "string", default: "v2" },
      "note-gate": { type: "boolean", default: false },
      ir: { type: "string" },
      "no-cab": { type: "boolean", default: false },
      "no-comp": { type: "boolean", default: false },
      room: { type: "boolean", default: false },
      gm: { type: "boolean", default: false },
      synth: { type: "string", default: "fluidsynth" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    return;
  }
  const [input] = positionals;
  if (!input || positionals.length > 1 || !values.out || !values.tag) {
    throw new Error(USAGE);
  }
  return {
    input,
    out: path.resolve(values.out),
    tag: values.tag,
    amp: parseAmp(values.amp),
    noteGate: values["note-gate"],
    ir: values.ir,
    noCab: values["no-cab"],
    noComp: values["no-comp"],
    room: values.room,
    gm: values.gm,
    synth: parseSynth(values.synth),
  };
}

function parseSynth(value: string) {
  if (value === "fluidsynth" || value === "spessasynth") {
    return value;
  }
  throw new Error(`unknown --synth: ${value}\n\n${USAGE}`);
}

function parseAmp(value: string): AmpName | "none" {
  if (value === "none" || value in AMPS) {
    return value as AmpName | "none";
  }
  throw new Error(`Unknown --amp ${value}\n\n${USAGE}`);
}

function readProject(input: string) {
  // Only audio clips need an AudioContext, to decode their samples, and a
  // SharedProject has no audio tracks.
  return deserializeEditorRuntimeState({
    context: undefined as never,
    project: convertSharedProject(JSON.parse(fs.readFileSync(input, "utf8"))),
  });
}

// --- rendering ----------------------------------------------------------------

// Render each MIDI track dry, once per distinct project, so variants that
// only change the amp reuse the same render. Export MIDI carries what the synth
// plays and leaves out each track's gain and pan, so the script applies them
// after the amp, as the app does after the synth.
async function renderDryTracks({
  tempo,
  midiTracks,
  options,
}: {
  tempo: number;
  midiTracks: MidiTrackState[];
  options: Options;
}) {
  const hash = crypto
    .createHash("sha1")
    .update(JSON.stringify({ tempo, midiTracks, synth: options.synth }))
    .digest("hex")
    .slice(0, 8);
  const dir = path.join(options.out, `render-${hash}`);
  if (fs.existsSync(path.join(dir, "done"))) {
    return dir;
  }
  fs.mkdirSync(dir, { recursive: true });
  await Promise.all(
    midiTracks.map(async (track, index) => {
      const raw = getDryTrackPath({ renderDir: dir, index, track });
      const trackMidi = raw.replace(/\.wav$/, ".mid");
      fs.writeFileSync(
        trackMidi,
        exportMidi({
          title: track.name,
          tempo,
          timeSignature: { numerator: 4, denominator: 4 },
          locators: [],
          tracks: [track],
        }),
      );
      const soundfont = track.soundfont
        ? findSoundfont(track.soundfont)
        : GENERAL_USER_SOUNDFONT;
      const soundfontPath = path.join(PUBLIC_DIR, soundfont.url);
      if (options.synth === "spessasynth") {
        await renderWithSpessaSynth({ soundfontPath, trackMidi, file: raw });
        return;
      }
      await execFileAsync("fluidsynth", [
        ...["-n", "-i", "-q"],
        ...["-g", "0.5"],
        // Reverb and chorus off, so the render is dry.
        ...["-R", "0", "-C", "0"],
        ...["-r", "48000"],
        ...["-F", raw],
        soundfontPath,
        trackMidi,
      ]);
    }),
  );
  fs.writeFileSync(path.join(dir, "done"), "");
  return dir;
}

const PUBLIC_DIR = path.join(import.meta.dirname, "../../public");

// Render with the synth the app plays MIDI tracks on, which responds to
// controllers fluidsynth ignores, such as CC 72 release time.
async function renderWithSpessaSynth({
  soundfontPath,
  trackMidi,
  file,
}: {
  soundfontPath: string;
  trackMidi: string;
  file: string;
}) {
  const rate = 48_000;
  const synth = new SpessaSynthProcessor(rate, {
    eventsEnabled: false,
    effectsEnabled: false,
  });
  await synth.processorInitialized;
  synth.soundBankManager.addSoundBank(
    SoundBankLoader.fromArrayBuffer(
      toArrayBuffer(fs.readFileSync(soundfontPath)),
    ),
    "main",
  );
  const midi = BasicMIDI.fromArrayBuffer(
    toArrayBuffer(fs.readFileSync(trackMidi)),
  );
  const sequencer = new SpessaSynthSequencer(synth);
  // Start at beat 0 like fluidsynth, so every track stays aligned.
  sequencer.skipToFirstNoteOn = false;
  sequencer.loadNewSongList([midi]);
  sequencer.play();
  const length = Math.ceil(midi.duration * rate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const blockSize = 128;
  for (let offset = 0; offset < length; offset += blockSize) {
    sequencer.processTick();
    synth.process(left, right, offset, Math.min(blockSize, length - offset));
  }
  fs.writeFileSync(
    file,
    new Uint8Array(audioToWav([left, right], rate, { normalizeAudio: false })),
  );
}

function toArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function getDryTrackPath({
  renderDir,
  index,
  track,
}: {
  renderDir: string;
  index: number;
  track: MidiTrackState;
}) {
  const slug = track.name.replace(/[^\w-]+/g, "-").toLowerCase();
  const number = String(index + 1).padStart(2, "0");
  return path.join(renderDir, `${number}-${slug}-raw.wav`);
}

// --- amp ------------------------------------------------------------------------

// Run a guitar track's dry render through the amp and cabinet, matched to its
// dry loudness, then apply the track's gain and pan. Drive makes a track much
// denser, so without the match the amp would also move the guitar up in the
// mix.
async function runAmp({
  track,
  gain,
  amp,
  raw,
  workDir,
  tempo,
  options,
}: {
  track: MidiTrackState;
  gain: GainLevel;
  amp: AmpName;
  raw: string;
  workDir: string;
  tempo: number;
  options: Options;
}) {
  const base = path.join(workDir, path.basename(raw, ".wav"));
  const rate = await readSampleRate(raw);
  // Mono, because a DI guitar is one signal. Float samples, because in the
  // 16-bit format the drive's volume boost would hard-clip before the soft
  // clipper sees it, and headroom so later boosts don't clip the 16-bit file.
  const mono = "aformat=sample_fmts=flt:channel_layouts=mono";
  const chain = [
    AMPS[amp][gain](rate, { compressor: !options.noComp }),
    "volume=-18dB",
  ];
  if (!options.ir && !options.noCab) {
    chain.push(FILTER_CABINET);
  }
  const filters = chain.filter(Boolean).join(",");
  const amped = `${base}-amp.wav`;
  if (options.noteGate) {
    const gate = `${base}-gate.wav`;
    writeNoteGate({ track, tempo, rate, file: gate });
    await runFfmpeg([
      ...["-i", raw, "-i", gate],
      "-filter_complex",
      `[0:a]${mono}[g];[1:a]${mono}[e];[g][e]amultiply,${filters}`,
      amped,
    ]);
  } else {
    await runFfmpeg(["-i", raw, "-af", `${mono},${filters}`, amped]);
  }
  let cabinet = amped;
  if (options.ir) {
    cabinet = `${base}-cab.wav`;
    await runFfmpeg([
      ...["-i", amped, "-i", options.ir],
      "-filter_complex",
      `[1:a]aresample=${rate},aformat=channel_layouts=mono[ir];[0:a][ir]afir=gtype=peak`,
      cabinet,
    ]);
  }
  const match = (await measureLoudness(raw)) - (await measureLoudness(cabinet));
  const post = [`volume=${match}dB`, "aformat=channel_layouts=stereo"];
  if (options.room) {
    post.push(ROOM);
  }
  post.push(buildChannelFilter(track));
  const out = `${base}-out.wav`;
  await runFfmpeg(["-i", cabinet, "-af", post.join(","), out]);
  return out;
}

// General MIDI stand-ins for `--gm`: Clean 27, Overdriven 29, Distortion 30.
// Muted tracks play Muted Guitar (28).
const GM_PROGRAMS = { clean: 27, crunch: 29, "high gain": 30 };

function findGainLevel(track: MidiTrackState) {
  const name = track.name.toLowerCase();
  return (Object.keys(GM_PROGRAMS) as GainLevel[]).find((gain) =>
    name.startsWith(gain),
  );
}

// Guitar tone controls before the drive, like a mid-boost overdrive pedal in
// front of the amp. It tightens the low end so the distortion doesn't flub.
const PRE_EQ = "highpass=f=90,equalizer=f=750:t=o:w=1.2:g=4";

// Speaker cabinet as filters: a guitar speaker rolls off steeply above about
// 5 kHz, which removes the fizz that clipping adds, with a presence bump and a
// low-mid dip.
const FILTER_CABINET = [
  "highpass=f=75",
  "lowpass=f=5200",
  "lowpass=f=5200",
  "lowpass=f=7000",
  "equalizer=f=2400:t=o:w=1:g=3",
  "equalizer=f=450:t=o:w=1.5:g=-2.5",
].join(",");

const TANH = "asoftclip=type=tanh";

// A DC offset before the clipper flattens one half of the wave more than the
// other, which adds even harmonics like a tube stage. The high-pass after it
// removes the offset again.
const ASYMMETRIC_TANH = `dcshift=0.15,${TANH},highpass=f=20`;

// A compressor in front of the drive keeps a decaying note pushed into the
// clipper, so it sustains at full distortion instead of cleaning up.
function buildSustainCompressor(ratio: number, { compressor }: AmpOptions) {
  if (!compressor) {
    return "";
  }
  return `acompressor=threshold=0.03:ratio=${ratio}:attack=5:release=200:makeup=4`;
}

// Drive stages run at 4x the sample rate, so the harmonics that clipping adds
// above the original Nyquist frequency are filtered out on the way back down
// instead of aliasing. asoftclip's own oversample option overshoots by about
// 9 dB, so the resampling is explicit.
function buildOversampled(rate: number, stages: string[]) {
  return [`aresample=${rate * 4}`, ...stages, `aresample=${rate}`].join(",");
}

type AmpOptions = { compressor: boolean };

const AMPS = {
  v1: {
    clean: () => "",
    crunch: (rate) =>
      [PRE_EQ, buildOversampled(rate, ["volume=20dB", TANH])].join(","),
    "high gain": (rate) =>
      [
        PRE_EQ,
        buildOversampled(rate, [
          "volume=24dB",
          TANH,
          "equalizer=f=1000:t=o:w=1:g=3",
          "volume=12dB",
          TANH,
        ]),
      ].join(","),
  },
  // Compression for sustain, an asymmetric first stage, and cascaded stages
  // that each clip less, the way a high-gain preamp does.
  v2: {
    clean: (_rate, options) => buildSustainCompressor(2, options),
    crunch: (rate, options) =>
      [
        PRE_EQ,
        buildSustainCompressor(4, options),
        buildOversampled(rate, [
          "volume=18dB",
          ASYMMETRIC_TANH,
          "equalizer=f=1000:t=o:w=1:g=2",
          "volume=6dB",
          TANH,
        ]),
      ]
        .filter(Boolean)
        .join(","),
    "high gain": (rate, options) =>
      [
        PRE_EQ,
        buildSustainCompressor(8, options),
        buildOversampled(rate, [
          "volume=18dB",
          ASYMMETRIC_TANH,
          "highpass=f=120,equalizer=f=1000:t=o:w=1:g=3",
          "volume=14dB",
          TANH,
          "volume=10dB",
          TANH,
        ]),
      ]
        .filter(Boolean)
        .join(","),
  },
} satisfies Record<
  string,
  Record<GainLevel, (rate: number, options: AmpOptions) => string>
>;

// A small room, as a few early reflections, because a fully dry distorted
// guitar sounds small next to a recorded one.
const ROOM = "aecho=0.9:0.6:19|31|47:0.18|0.12|0.08";

// A gate keyed to the notes rather than to the audio level: open while a note
// is held, closing over NOTE_GATE_RELEASE seconds after its note-off, like the
// fretting hand letting go of the string. Without it, the compressor and drive
// raise each note's decay after note-off to full distortion and smear the
// phrasing, and a gate on the audio level can't tell that decay from a held
// note's sustain.
const NOTE_GATE_RELEASE = 0.03;

function writeNoteGate({
  track,
  tempo,
  rate,
  file,
}: {
  track: MidiTrackState;
  tempo: number;
  rate: number;
  file: string;
}) {
  const toSeconds = (beat: number) => (beat * 60) / tempo;
  const end = Math.max(...track.notes.map((n) => n.start + n.duration));
  const envelope = new Float32Array(Math.ceil((toSeconds(end) + 1) * rate));
  const release = NOTE_GATE_RELEASE * rate;
  for (const note of track.notes) {
    const on = Math.round(toSeconds(note.start) * rate);
    const off = Math.round(toSeconds(note.start + note.duration) * rate);
    for (let i = on; i < off + release && i < envelope.length; i++) {
      const level = i < off ? 1 : 1 - (i - off) / release;
      envelope[i] = Math.max(envelope[i]!, level);
    }
  }
  // 32-bit float mono WAV.
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + envelope.byteLength, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(32, 34);
  header.write("data", 36);
  header.writeUInt32LE(envelope.byteLength, 40);
  fs.writeFileSync(file, Buffer.concat([header, Buffer.from(envelope.buffer)]));
}

// --- mixing ---------------------------------------------------------------------

// Mix the given track files and normalize the mix to MIX_LUFS as an MP3, so
// variants compare by tone rather than by level, since the louder of two
// otherwise tends to sound better. The gain is measured, then applied as one
// linear step. ffmpeg's loudnorm in one pass would apply dynamic gain, which
// changes the sound under comparison.
async function mixTracks(inputs: string[], output: string) {
  const wav = output.replace(/\.mp3$/, ".wav");
  await runFfmpeg([
    ...inputs.flatMap((file) => ["-i", file]),
    "-filter_complex",
    `amix=inputs=${inputs.length}:normalize=0:duration=longest`,
    wav,
  ]);
  const gain = MIX_LUFS - (await measureLoudness(wav));
  await runFfmpeg([
    ...["-i", wav],
    ...["-af", `volume=${gain}dB`],
    ...["-b:a", "192k"],
    output,
  ]);
  fs.rmSync(wav);
}

// The track's gain, then an equal-power pan, as Web Audio's StereoPannerNode
// does on stereo input.
function buildChannelFilter(track: MidiTrackState) {
  const { pan } = track;
  const x = pan <= 0 ? pan + 1 : pan;
  const a = Math.cos((x * Math.PI) / 2);
  const b = Math.sin((x * Math.PI) / 2);
  const panFilter =
    pan <= 0
      ? `pan=stereo|c0=c0+${a}*c1|c1=${b}*c1`
      : `pan=stereo|c0=${a}*c0|c1=c1+${b}*c0`;
  return `volume=${track.gain},${panFilter}`;
}

// --- ffmpeg -------------------------------------------------------------------

async function runFfmpeg(args: string[]) {
  await execFileAsync("ffmpeg", ["-y", "-v", "error", ...args]);
}

async function measureLoudness(wav: string) {
  // ebur128 prints its summary on stderr.
  const { stderr } = await execFileAsync("ffmpeg", [
    ...["-nostats", "-i", wav],
    ...["-af", "ebur128=framelog=quiet"],
    ...["-f", "null", "-"],
  ]);
  const match = stderr.match(/I:\s*(-?[\d.]+|-inf)\s*LUFS/);
  if (!match) {
    throw new Error(`Could not measure the loudness of ${wav}`);
  }
  return match[1] === "-inf" ? -Infinity : Number(match[1]);
}

async function readSampleRate(wav: string) {
  const { stdout } = await execFileAsync("ffprobe", [
    ...["-v", "error"],
    ...["-show_entries", "stream=sample_rate"],
    ...["-of", "csv=p=0"],
    wav,
  ]);
  return Number(stdout.trim());
}

main().catch((error) => {
  // Errors carry user-facing messages, so skip stack traces.
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
