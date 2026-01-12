export interface Note {
  id: string;
  pitch: number; // MIDI note number (0-127, e.g. C4=60)
  start: number; // Start time in beats
  duration: number; // Duration in beats
  velocity: number; // 0-127, default 100
}

export type GridSnap = "1/4" | "1/8" | "1/16" | "1/4T" | "1/8T" | "1/16T";

export const GRID_SNAP_VALUES: Record<GridSnap, number> = {
  "1/4": 1,
  "1/8": 0.5,
  "1/16": 0.25,
  "1/4T": 1 / 3,
  "1/8T": 1 / 6,
  "1/16T": 1 / 12,
};

export interface TimeSignature {
  numerator: number; // beats per bar (e.g., 3, 4, 5, 7)
  denominator: number; // beat unit (e.g., 4 for quarter note, 8 for eighth note)
}

// Common time signatures
export const COMMON_TIME_SIGNATURES: TimeSignature[] = [
  { numerator: 3, denominator: 4 }, // 3/4 (waltz)
  { numerator: 4, denominator: 4 }, // 4/4 (common time)
  { numerator: 5, denominator: 4 }, // 5/4
  { numerator: 6, denominator: 8 }, // 6/8
  { numerator: 7, denominator: 4 }, // 7/4
];
