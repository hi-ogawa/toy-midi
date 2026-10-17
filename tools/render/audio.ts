import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SAMPLE_RATE = 48_000;

/** Render a MIDI file to stereo WAV with reverb and chorus off. */
export async function renderMidi({
  midiPath,
  wavPath,
  soundFont,
}: {
  midiPath: string;
  wavPath: string;
  soundFont: string;
}): Promise<void> {
  await execFileAsync("fluidsynth", [
    ...["-n", "-i", "-q"],
    ...["-g", "0.5"],
    ...["-R", "0", "-C", "0"],
    ...["-r", String(SAMPLE_RATE)],
    ...["-F", wavPath],
    soundFont,
    midiPath,
  ]);
}

/**
 * Apply channel gain, then pan like Web Audio's StereoPannerNode does on
 * stereo input: panning toward one side folds part of the other channel into
 * it with equal-power weights.
 */
export async function applyChannel({
  inputPath,
  outputPath,
  gain,
  pan,
}: {
  inputPath: string;
  outputPath: string;
  gain: number;
  pan: number;
}): Promise<void> {
  const x = pan <= 0 ? pan + 1 : pan;
  const a = Math.cos((x * Math.PI) / 2);
  const b = Math.sin((x * Math.PI) / 2);
  const panFilter =
    pan <= 0
      ? `pan=stereo|c0=c0+${a}*c1|c1=${b}*c1`
      : `pan=stereo|c0=${a}*c0|c1=c1+${b}*c0`;
  await ffmpeg([
    "-i",
    inputPath,
    "-af",
    `volume=${gain},${panFilter}`,
    outputPath,
  ]);
}

/** Sum tracks without normalization, then apply the master gain. */
export async function mixTracks({
  inputPaths,
  outputPath,
  masterGain,
}: {
  inputPaths: string[];
  outputPath: string;
  masterGain: number;
}): Promise<void> {
  await ffmpeg([
    ...inputPaths.flatMap((inputPath) => ["-i", inputPath]),
    ...[
      "-filter_complex",
      `amix=inputs=${inputPaths.length}:normalize=0:duration=longest,volume=${masterGain}`,
    ],
    outputPath,
  ]);
}

export async function encodeMp3({
  inputPath,
  outputPath,
}: {
  inputPath: string;
  outputPath: string;
}): Promise<void> {
  await ffmpeg(["-i", inputPath, "-b:a", "192k", outputPath]);
}

/** Integrated loudness in LUFS, or -Infinity for silence. */
export async function measureLoudness(wavPath: string): Promise<number> {
  // ebur128 prints its summary on stderr.
  const { stderr } = await execFileAsync("ffmpeg", [
    "-nostats",
    ...["-i", wavPath],
    ...["-af", "ebur128=framelog=quiet"],
    ...["-f", "null", "-"],
  ]);
  const match = stderr.match(
    /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+|-inf)\s*LUFS/,
  );
  if (!match) {
    throw new Error(`Could not measure loudness of ${wavPath}`);
  }
  return match[1] === "-inf" ? -Infinity : Number(match[1]);
}

async function ffmpeg(args: string[]): Promise<void> {
  await execFileAsync("ffmpeg", ["-y", "-v", "error", ...args]);
}
