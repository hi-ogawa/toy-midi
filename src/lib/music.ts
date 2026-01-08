// Bass range: E1 (28) to G3 (55)
export const MIN_PITCH = 28; // E1
export const MAX_PITCH = 55; // G3
export const PITCH_COUNT = MAX_PITCH - MIN_PITCH + 1; // 28 rows

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
  return Math.floor(value / gridSize) * gridSize;
}

export function clampPitch(pitch: number): number {
  return Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
}
