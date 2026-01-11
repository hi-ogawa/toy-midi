export interface Note {
  id: string;
  pitch: number; // MIDI note number (E1=28, G3=55)
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
  numerator: number; // beats per bar (e.g., 3, 4, 5, 6)
  denominator: number; // beat value (e.g., 4, 8)
}
