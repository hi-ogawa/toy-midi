import type { SpelledPitch } from "../pitch-spelling";
import type { TabPosition } from "../tab-annotation";

export const MUSICXML_DIVISIONS = 12;

export type DurationNotation = {
  type: string;
  dots?: number;
  triplet?: boolean;
};

export type MusicXmlMeasureEvent =
  | { type: "rest"; duration: number; notation: DurationNotation }
  | {
      type: "note";
      pitch: SpelledPitch;
      duration: number;
      notation: DurationNotation;
      tabPosition: TabPosition;
      tieStart: boolean;
      tieStop: boolean;
    };

export type MeasureNote = {
  start: number;
  end: number;
  pitch: SpelledPitch;
  tabPosition: TabPosition;
};

type DurationCandidate = DurationNotation & {
  duration: number;
  alignment: number;
};

const DURATION_CANDIDATES: DurationCandidate[] = [
  { duration: 48, alignment: 48, type: "whole" },
  { duration: 36, alignment: 24, type: "half", dots: 1 },
  { duration: 32, alignment: 32, type: "whole", triplet: true },
  { duration: 24, alignment: 24, type: "half" },
  { duration: 18, alignment: 12, type: "quarter", dots: 1 },
  { duration: 16, alignment: 16, type: "half", triplet: true },
  { duration: 12, alignment: 12, type: "quarter" },
  { duration: 9, alignment: 6, type: "eighth", dots: 1 },
  { duration: 8, alignment: 8, type: "quarter", triplet: true },
  { duration: 6, alignment: 6, type: "eighth" },
  { duration: 4, alignment: 4, type: "eighth", triplet: true },
  { duration: 3, alignment: 3, type: "16th" },
  { duration: 2, alignment: 2, type: "16th", triplet: true },
  // This one-unit fallback makes every positive integer grid duration
  // decomposable after toGridUnits has validated its inputs.
  { duration: 1, alignment: 1, type: "32nd", triplet: true },
];

/** Clips notes to one measure and fills its timeline with notated notes and rests. */
export function buildMeasureEvents({
  notes,
  measureStart,
  measureDuration,
}: {
  notes: MeasureNote[];
  measureStart: number;
  measureDuration: number;
}): MusicXmlMeasureEvent[] {
  const events: MusicXmlMeasureEvent[] = [];
  let cursor = 0;

  for (const note of notes) {
    // Convert the assigned note to measure-local bounds.
    const originalNoteStart = note.start - measureStart;
    const originalNoteEnd = note.end - measureStart;
    const noteStart = Math.max(originalNoteStart, 0);
    const noteEnd = Math.min(originalNoteEnd, measureDuration);

    // Fill silence before this note, including any gap after the previous note.
    if (noteStart > cursor) {
      for (const piece of splitDuration({
        start: cursor,
        duration: noteStart - cursor,
      })) {
        events.push({
          type: "rest" as const,
          duration: piece.duration,
          notation: piece.notation,
        });
      }
    }

    // Split the clipped note into notatable tied pieces.
    let pieceStart = noteStart;
    for (const piece of splitDuration({
      start: noteStart,
      duration: noteEnd - noteStart,
    })) {
      const pieceEnd = pieceStart + piece.duration;
      events.push({
        type: "note",
        pitch: note.pitch,
        duration: piece.duration,
        notation: piece.notation,
        tabPosition: note.tabPosition,
        // Splits within or across measures become one tied chain, which is then
        // rendered identically on both notation staves.
        tieStart: pieceEnd < originalNoteEnd,
        tieStop: pieceStart > originalNoteStart,
      });
      pieceStart = pieceEnd;
    }
    cursor = noteEnd;
  }

  // Fill silence from the final note to the end of the measure.
  if (cursor < measureDuration) {
    for (const piece of splitDuration({
      start: cursor,
      duration: measureDuration - cursor,
    })) {
      events.push({
        type: "rest" as const,
        duration: piece.duration,
        notation: piece.notation,
      });
    }
  }
  return events;
}

/** Decomposes a grid duration into the longest notation values valid at each offset. */
function splitDuration({
  start,
  duration,
}: {
  start: number;
  duration: number;
}): { duration: number; notation: DurationNotation }[] {
  const result: { duration: number; notation: DurationNotation }[] = [];
  let cursor = start;
  let remaining = duration;
  while (remaining > 0) {
    // Prefer the longest value aligned to its own grid. Triplets may also start
    // where they complete a supported one- or two-beat tuplet span.
    const candidate = DURATION_CANDIDATES.find(
      (item) =>
        item.duration <= remaining && isCandidateAligned({ item, cursor }),
    )!;
    result.push({
      duration: candidate.duration,
      notation: {
        type: candidate.type,
        dots: candidate.dots,
        triplet: candidate.triplet,
      },
    });
    cursor += candidate.duration;
    remaining -= candidate.duration;
  }
  return result;
}

function isCandidateAligned({
  item,
  cursor,
}: {
  item: DurationCandidate;
  cursor: number;
}): boolean {
  if (cursor % item.alignment === 0) {
    return true;
  }
  // Allow written quarter-triplet values or shorter to complete the beat.
  if (item.triplet && item.duration <= MUSICXML_DIVISIONS) {
    return (cursor + item.duration) % MUSICXML_DIVISIONS === 0;
  }
  return false;
}
