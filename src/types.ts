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
 * Values for one synth parameter over the track's timeline. Each value holds
 * until the next point. Before the first point, the synth's default applies,
 * such as 127 for expression (CC11), 0 for sustain (CC64), and no bend.
 */
export type Automation =
  | {
      type: "controller";
      /**
       * MIDI controller number (0-119), such as 1 modulation, 11 expression,
       * or 64 sustain. At most one sequence per controller. The player owns
       * bank select (0, 32), parameter numbers (98-101), and data entry (6,
       * 38).
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
      /** At most one sequence per track */
      type: "pitch-bend";
      /** Sorted by beat */
      points: {
        /** Time in beats from the start of the project */
        beat: number;
        /** Offset from the note's pitch, from -12 to 12 */
        semitones: number;
      }[];
    };

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

// Common time signatures
export const COMMON_TIME_SIGNATURES: TimeSignature[] = [
  { numerator: 3, denominator: 4 }, // 3/4 (waltz)
  { numerator: 4, denominator: 4 }, // 4/4 (common time)
  { numerator: 5, denominator: 4 }, // 5/4
  { numerator: 6, denominator: 8 }, // 6/8
  { numerator: 7, denominator: 4 }, // 7/4
];

export const DEFAULT_TIME_SIGNATURE = COMMON_TIME_SIGNATURES[1];
