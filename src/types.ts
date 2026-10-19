export type TabString = 1 | 2 | 3 | 4 | 5;

export interface Note {
  /** Any string unique within the track, such as `crypto.randomUUID()` */
  id: string;
  /** MIDI note number (0-127, e.g. C4=60) */
  pitch: number;
  /** Start time in beats from the start of the project */
  start: number;
  /** Duration in beats */
  duration: number;
  /** 0-127, default 100 */
  velocity: number;
  /**
   * Tab string, 1-based into the track's `tabOpenStringPitches`. Without one,
   * or when that string cannot play the pitch, tab and score use the highest
   * string that can.
   */
  tabString?: TabString;
}

/**
 * Each value holds until the next point, so start a sequence at beat 0 to set
 * its value from the start. A track has at most one sequence per controller
 * and one for pitch bend.
 */
export type Automation =
  | {
      type: "controller";
      /**
       * MIDI controller number (0-119), such as 1 modulation, 11 expression,
       * or 64 sustain
       */
      controller: number;
      /** Sorted by beat */
      points: {
        /** Time in beats from the start of the project */
        beat: number;
        /** 0-127 */
        value: number;
      }[];
    }
  | {
      type: "pitch-bend";
      /** Sorted by beat */
      points: {
        /** Time in beats from the start of the project */
        beat: number;
        /** Offset from the note's pitch, from -12 to 12 */
        semitones: number;
      }[];
    };

/**
 * Positions and durations are in beats, and a beat is always a quarter note,
 * so a bar is `numerator * 4 / denominator` beats, such as 3.5 in 7/8.
 */
export interface TimeSignature {
  /** Top number (e.g., 3, 4, 5, 7) */
  numerator: number;
  /** Bottom number, the note value the top number counts (e.g., 4 or 8) */
  denominator: number;
}

export function parseTimeSignature(value: string): TimeSignature {
  const [numerator, denominator] = value.split("/").map(Number);
  return { numerator, denominator };
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
