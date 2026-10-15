import type { Note } from "../../src/types.ts";

type PlainNote = Omit<Note, "id">;

/**
 * A note with guitar articulation fields, which the app doesn't play yet. They
 * assume a monophonic track.
 */
export interface ArticulatedNote extends PlainNote {
  /**
   * - `h` or `p` (hammer-on or pull-off): no new pick. The sounding note keeps
   *   ringing, and its pitch steps to this note's pitch.
   * - `b` (bend): picked `bend` semitones below and bent up to this pitch.
   * - `r` (release): no new pick, and the pitch glides back to this note's pitch.
   */
  art?: "h" | "p" | "b" | "r";
  /** Semitones a `b` note bends up from, 2 by default */
  bend?: number;
  /** Vibrato depth in cents on a held note */
  vib?: number;
}

export interface PitchBendPoint {
  beat: number;
  semitones: number;
}

/**
 * Turn articulated notes into plain picked notes plus a channel pitch-bend
 * curve, in semitones from each picked note's pitch.
 */
export function expandArticulations({
  notes,
  tempo,
}: {
  notes: ArticulatedNote[];
  tempo: number;
}): { notes: PlainNote[]; bends: PitchBendPoint[] } {
  if (!notes.some((note) => note.art || note.vib)) {
    return { notes, bends: [] };
  }
  const msToBeats = (ms: number) => (ms * tempo) / 60_000;
  const picked: PlainNote[] = [];
  const bends: PitchBendPoint[] = [];
  const ramp = ({
    beat,
    from,
    to,
    ms,
  }: {
    beat: number;
    from: number;
    to: number;
    ms: number;
  }) => {
    for (let step = 1; step <= 8; step++) {
      bends.push({
        beat: beat + (msToBeats(ms) * step) / 8,
        semitones: from + ((to - from) * step) / 8,
      });
    }
  };

  let sounding: PlainNote | undefined;
  let bend = 0;
  for (const { art, bend: bendAmount, vib, ...note } of notes.toSorted(
    (a, b) => a.start - b.start,
  )) {
    // Legato articulations extend the sounding note instead of picking a new one.
    if (sounding && (art === "h" || art === "p" || art === "r")) {
      sounding.duration = Math.max(
        sounding.duration,
        note.start + note.duration - sounding.start,
      );
      const target = note.pitch - sounding.pitch;
      if (art === "r") {
        ramp({ beat: note.start, from: bend, to: target, ms: 60 });
      } else {
        bends.push({ beat: note.start, semitones: target });
      }
      bend = target;
      continue;
    }

    // A new pick starts from an unbent string.
    if (bend !== 0) {
      bends.push({ beat: note.start, semitones: 0 });
    }
    bend = 0;
    sounding = { ...note };
    picked.push(sounding);
    if (art === "b") {
      const amount = bendAmount ?? 2;
      sounding.pitch = note.pitch - amount;
      ramp({ beat: note.start + msToBeats(15), from: 0, to: amount, ms: 80 });
      bend = amount;
    }

    // Vibrato fades in at 5.5 Hz after a short delay, around the current bend.
    if (vib) {
      const vibratoStart = note.start + msToBeats(120);
      const end = note.start + note.duration;
      for (let beat = vibratoStart; beat < end; beat += msToBeats(10)) {
        const depth = Math.min(1, (beat - vibratoStart) / msToBeats(150));
        const seconds = ((beat - vibratoStart) * 60) / tempo;
        bends.push({
          beat,
          semitones:
            bend + (vib / 100) * depth * Math.sin(2 * Math.PI * 5.5 * seconds),
        });
      }
      bends.push({ beat: end, semitones: bend });
    }
  }
  return { notes: picked, bends };
}
