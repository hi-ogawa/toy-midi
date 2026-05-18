// Full MIDI range: C-1 (0) to G9 (127)
export const MIN_PITCH = 0; // C-1
export const MAX_PITCH = 127; // G9
const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const note = NOTE_NAMES[midi % 12];
  return `${note}${octave}`;
}

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

const GRID_DURATION_EPSILON = 1e-9;

export function hasMinimumGridDuration(
  duration: number,
  gridSize: number,
): boolean {
  return duration >= gridSize - GRID_DURATION_EPSILON;
}

export function clampPitch(pitch: number): number {
  return Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
}
