export type TabString = 1 | 2 | 3 | 4 | 5;

export interface Note {
  id: string;
  /** MIDI note number (0-127, e.g. C4=60) */
  pitch: number;
  /** Start time in beats from the start of the project */
  start: number;
  /** Duration in beats */
  duration: number;
  /** 0-127, default 100 */
  velocity: number;
  /** Tab string, 1-based into the track's `tabOpenStringPitches` */
  tabString?: TabString;
}

export type GridSnap = "1/4" | "1/8" | "1/16" | "1/4T" | "1/8T" | "1/16T";

export interface TimeSignature {
  /** Beats per bar (e.g., 3, 4, 5, 7) */
  numerator: number;
  /** Beat unit (e.g., 4 for quarter note, 8 for eighth note) */
  denominator: number;
}

export function parseTimeSignature(value: string): TimeSignature {
  const [numerator, denominator] = value.split("/").map(Number);
  return { numerator, denominator };
}

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

export const DEFAULT_TIME_SIGNATURE = COMMON_TIME_SIGNATURES[1];
