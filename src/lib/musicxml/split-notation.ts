import type { TimeSignature } from "../../types";
import type { SpelledPitch } from "../pitch-spelling";
import type { TabPosition } from "../tab-annotation";
import type { QuantizedNote } from "./model";

// Splits measure note and silence spans into writable note/rest durations and ties.

export const MUSICXML_DIVISIONS = 12;

export type MusicXmlMeasureEvent =
  | {
      type: "note";
      pitch: SpelledPitch;
      duration: number;
      notation: DurationNotation;
      tabPosition: TabPosition;
      tieStart: boolean;
      tieStop: boolean;
    }
  | { type: "rest"; duration: number; notation: DurationNotation };

export type DurationNotation = {
  type: string;
  dots?: number;
  triplet?: boolean;
};

type DurationCandidate = DurationNotation & {
  duration: number;
};

type MetricContext = {
  measureDuration: number;
  beatDuration: number;
};

type DurationPath = {
  candidates: DurationCandidate[];
  score: number;
};

const DURATION_CANDIDATES: DurationCandidate[] = [
  { duration: 48, type: "whole" },
  { duration: 36, type: "half", dots: 1 },
  { duration: 32, type: "whole", triplet: true },
  { duration: 24, type: "half" },
  { duration: 18, type: "quarter", dots: 1 },
  { duration: 16, type: "half", triplet: true },
  { duration: 12, type: "quarter" },
  { duration: 9, type: "eighth", dots: 1 },
  { duration: 8, type: "quarter", triplet: true },
  { duration: 6, type: "eighth" },
  { duration: 4, type: "eighth", triplet: true },
  { duration: 3, type: "16th" },
  { duration: 2, type: "16th", triplet: true },
  { duration: 1, type: "32nd", triplet: true },
];

/** Clips notes to one measure and fills its timeline with notated notes and rests. */
export function buildMeasureEvents({
  notes,
  measureStart,
  measureDuration,
  timeSignature,
}: {
  notes: QuantizedNote[];
  measureStart: number;
  measureDuration: number;
  timeSignature: TimeSignature;
}): MusicXmlMeasureEvent[] {
  const events: MusicXmlMeasureEvent[] = [];
  const metric = buildMetricContext({ timeSignature });
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
        durationType: "rest",
        metric,
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
      durationType: "note",
      metric,
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
      durationType: "rest",
      metric,
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

function buildMetricContext({
  timeSignature,
}: {
  timeSignature: TimeSignature;
}): MetricContext {
  const measureDuration =
    timeSignature.numerator *
    (4 / timeSignature.denominator) *
    MUSICXML_DIVISIONS;
  const beatDuration =
    timeSignature.denominator === 8 && timeSignature.numerator % 3 === 0
      ? 1.5 * MUSICXML_DIVISIONS
      : (4 / timeSignature.denominator) * MUSICXML_DIVISIONS;
  return { measureDuration, beatDuration };
}

/** Chooses the lowest-cost complete notation path for a grid duration. */
function splitDuration({
  start,
  duration,
  durationType,
  metric,
}: {
  start: number;
  duration: number;
  durationType: "note" | "rest";
  metric: MetricContext;
}): { duration: number; notation: DurationNotation }[] {
  const end = start + duration;
  const memo = new Map<number, DurationPath>();

  function visit(cursor: number): DurationPath {
    if (cursor === end) {
      return { candidates: [], score: 0 };
    }
    const cached = memo.get(cursor);
    if (cached) {
      return cached;
    }

    const result = DURATION_CANDIDATES.filter(
      (candidate) => cursor + candidate.duration <= end,
    )
      .map((candidate) => {
        const suffix = visit(cursor + candidate.duration);
        return {
          candidates: [candidate, ...suffix.candidates],
          score:
            scoreCandidate({ candidate, cursor, durationType, metric }) +
            scoreTransition(candidate, suffix.candidates[0]) +
            suffix.score,
        };
      })
      .toSorted(comparePaths)[0];
    memo.set(cursor, result);
    return result;
  }

  return visit(start).candidates.map((candidate) => ({
    duration: candidate.duration,
    notation: {
      type: candidate.type,
      dots: candidate.dots,
      triplet: candidate.triplet,
    },
  }));
}

function scoreCandidate({
  candidate,
  cursor,
  durationType,
  metric,
}: {
  candidate: DurationCandidate;
  cursor: number;
  durationType: "note" | "rest";
  metric: MetricContext;
}): number {
  const end = cursor + candidate.duration;
  let score = 1;

  for (
    let boundary = metric.beatDuration;
    boundary < metric.measureDuration;
    boundary += metric.beatDuration
  ) {
    if (cursor < boundary && end > boundary) {
      const isMidpoint = boundary === metric.measureDuration / 2;
      score += isMidpoint ? 100 : durationType === "rest" ? 40 : 20;
    }
  }

  if (candidate.triplet) {
    const startsOnTripletGrid = cursor % 4 === 0;
    const endsOnTripletGrid = end % 4 === 0;
    score += startsOnTripletGrid && endsOnTripletGrid ? 0 : 12;
  } else if (cursor % 3 !== 0 || end % 3 !== 0) {
    score += 8;
  }
  return score;
}

function scoreTransition(
  candidate: DurationCandidate,
  next: DurationCandidate | undefined,
): number {
  if (!next) {
    return 0;
  }
  let score = candidate.triplet === next.triplet ? 0 : 8;
  if (next.duration * 4 <= candidate.duration) {
    score += 10;
  }
  return score;
}

function comparePaths(left: DurationPath, right: DurationPath): number {
  return (
    left.score - right.score || left.candidates.length - right.candidates.length
  );
}
