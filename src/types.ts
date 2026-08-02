export type TabString = 1 | 2 | 3 | 4 | 5;

export interface Note {
  id: string;
  pitch: number; // MIDI note number (0-127, e.g. C4=60)
  start: number; // Start time in beats
  duration: number; // Duration in beats
  velocity: number; // 0-127, default 100
  tabString?: TabString;
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

export interface KeySignature {
  fifths: number; // Number of flats (-) or sharps (+)
  mode: "major" | "minor";
}

export const KEY_SIGNATURES: (KeySignature & { label: string })[] = [
  { fifths: -7, mode: "major", label: "C-flat major" },
  { fifths: -6, mode: "major", label: "G-flat major" },
  { fifths: -5, mode: "major", label: "D-flat major" },
  { fifths: -4, mode: "major", label: "A-flat major" },
  { fifths: -3, mode: "major", label: "E-flat major" },
  { fifths: -2, mode: "major", label: "B-flat major" },
  { fifths: -1, mode: "major", label: "F major" },
  { fifths: 0, mode: "major", label: "C major" },
  { fifths: 1, mode: "major", label: "G major" },
  { fifths: 2, mode: "major", label: "D major" },
  { fifths: 3, mode: "major", label: "A major" },
  { fifths: 4, mode: "major", label: "E major" },
  { fifths: 5, mode: "major", label: "B major" },
  { fifths: 6, mode: "major", label: "F-sharp major" },
  { fifths: 7, mode: "major", label: "C-sharp major" },
  { fifths: -7, mode: "minor", label: "A-flat minor" },
  { fifths: -6, mode: "minor", label: "E-flat minor" },
  { fifths: -5, mode: "minor", label: "B-flat minor" },
  { fifths: -4, mode: "minor", label: "F minor" },
  { fifths: -3, mode: "minor", label: "C minor" },
  { fifths: -2, mode: "minor", label: "G minor" },
  { fifths: -1, mode: "minor", label: "D minor" },
  { fifths: 0, mode: "minor", label: "A minor" },
  { fifths: 1, mode: "minor", label: "E minor" },
  { fifths: 2, mode: "minor", label: "B minor" },
  { fifths: 3, mode: "minor", label: "F-sharp minor" },
  { fifths: 4, mode: "minor", label: "C-sharp minor" },
  { fifths: 5, mode: "minor", label: "G-sharp minor" },
  { fifths: 6, mode: "minor", label: "D-sharp minor" },
  { fifths: 7, mode: "minor", label: "A-sharp minor" },
];

export interface Locator {
  id: string;
  position: number; // Position on timeline in beats
  label: string; // User-defined label (e.g., "Verse", "Chorus")
}

// Common time signatures
export const COMMON_TIME_SIGNATURES: TimeSignature[] = [
  { numerator: 3, denominator: 4 }, // 3/4 (waltz)
  { numerator: 4, denominator: 4 }, // 4/4 (common time)
  { numerator: 5, denominator: 4 }, // 5/4
  { numerator: 6, denominator: 8 }, // 6/8
  { numerator: 7, denominator: 4 }, // 7/4
];
