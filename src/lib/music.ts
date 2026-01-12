// Full MIDI range: C-1 (0) to G9 (127)
export const MIN_PITCH = 0; // C-1
export const MAX_PITCH = 127; // G9
export const PITCH_COUNT = MAX_PITCH - MIN_PITCH + 1; // 128 rows

// Default view range: C3 (48) to E5 (76) - centered around middle C (60)
export const DEFAULT_VIEW_MIN_PITCH = 48; // C3
export const DEFAULT_VIEW_MAX_PITCH = 76; // E5

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

export function pitchToY(pitch: number, rowHeight: number): number {
  return (MAX_PITCH - pitch) * rowHeight;
}

export function yToPitch(y: number, rowHeight: number): number {
  return MAX_PITCH - Math.floor(y / rowHeight);
}

export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function clampPitch(pitch: number): number {
  return Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
}
