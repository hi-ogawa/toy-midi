import {
  NATURAL_PITCH_CLASS_BY_LETTER,
  type NoteLetter,
} from "./pitch-spelling.ts";

// Full MIDI range: C-1 (0) to G9 (127)
const MIN_PITCH = 0; // C-1
export const MAX_PITCH = 127; // G9
export const MIN_DB = -60;
export const MAX_DB = 6;
const LOG2 = Math.log(2);
export const A4_FREQUENCY_HZ = 440;
const MIN_GAIN = dbToGain(MIN_DB);

export function isBlackKey(midi: number): boolean {
  const note = midi % 12;
  return [1, 3, 6, 8, 10].includes(note);
}

export function snapToGrid(
  value: number,
  gridSize: number,
  options?: {
    floor?: boolean;
  },
): number {
  const round = options?.floor ? Math.floor : Math.round;
  return round(value / gridSize) * gridSize;
}

export function clampPitch(pitch: number): number {
  return Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
}

export function getMidiOctavePitches({
  minPitch,
  maxPitch,
}: {
  minPitch: number;
  maxPitch: number;
}): number[] {
  const firstPitch = Math.max(MIN_PITCH, Math.ceil(minPitch / 12) * 12);
  const lastPitch = Math.min(maxPitch, MAX_PITCH);
  const pitches: number[] = [];
  for (let pitch = firstPitch; pitch <= lastPitch; pitch += 12) {
    pitches.push(pitch);
  }
  return pitches;
}

export function parseMidiPitch(pitch: string): number {
  const match = /^([A-G])(\d+)$/.exec(pitch);
  if (!match) {
    throw new Error(`Invalid MIDI pitch: ${pitch}`);
  }
  const [, letter, octave] = match;
  return (
    (Number(octave) + 1) * 12 +
    NATURAL_PITCH_CLASS_BY_LETTER[letter as NoteLetter]
  );
}

export function midiToHz(midi: number): number {
  return A4_FREQUENCY_HZ * Math.pow(2, (midi - 69) / 12);
}

export function hzToMidi(frequencyHz: number): number {
  return 69 + 12 * Math.log2(frequencyHz / A4_FREQUENCY_HZ);
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  if (gain <= MIN_GAIN) {
    return MIN_DB;
  }
  return 20 * Math.log10(gain);
}

export function formatGainDb(gain: number): string {
  if (gain === 0) {
    return "-∞ dB";
  }
  const db = gainToDb(gain);
  return `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`;
}

export function percentToGain(percent: number): number {
  const position = clamp(percent / 100, 0, 1);
  if (position === 0) {
    return 0;
  }
  return Math.exp(((Math.pow(position, 1 / 8) * 198 - 192) / 6) * LOG2);
}

export function gainToPercent(gain: number): number {
  if (gain <= 0) {
    return 0;
  }
  const position = Math.pow(((6 * Math.log(gain)) / LOG2 + 192) / 198, 8);
  return clamp(position * 100, 0, 100);
}

export function dbToPercent(db: number): number {
  return gainToPercent(dbToGain(clamp(db, MIN_DB, MAX_DB)));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getMinMax(
  values: number[],
): { min: number; max: number } | undefined {
  const first = values.at(0);
  if (first === undefined) {
    return undefined;
  }

  let min = first;
  let max = first;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}
