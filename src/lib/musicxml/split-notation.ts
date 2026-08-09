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

export type MetricContext = {
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
  metric,
}: {
  notes: QuantizedNote[];
  measureStart: number;
  measureDuration: number;
  metric: MetricContext;
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

/**
 * Chooses the lowest-cost complete notation path for a grid duration.
 *
 * Treat each grid offset from `start` through `end` as a node in a directed
 * acyclic graph. A duration candidate that fits creates an edge from the
 * current offset to the offset after that candidate. `visit(cursor)` finds the
 * best path from one node to `end`, so memoizing by cursor evaluates each
 * suffix once while preserving the natural right-to-left transition scoring.
 *
 * For a span of D grid units and C duration candidates, the search examines
 * O(D * C) candidate edges and stores O(D) memoized states. The current states
 * contain complete suffix arrays, so constructing candidate paths can copy up
 * to O(D) elements per edge, giving a pessimistic O(D^2 * C) implementation
 * bound. D is at most a small measure-sized grid in normal use.
 */
function splitDuration({
  start,
  duration,
  metric,
}: {
  start: number;
  duration: number;
  metric: MetricContext;
}): { duration: number; notation: DurationNotation }[] {
  const end = start + duration;
  // Every recursive state represents the best complete notation from one grid
  // offset to the fixed end. Memoization avoids re-evaluating shared suffixes.
  const memo = new Map<number, DurationPath>();

  function visit(cursor: number): DurationPath {
    if (cursor === end) {
      return { candidates: [], score: 0 };
    }
    const cached = memo.get(cursor);
    if (cached) {
      return cached;
    }

    // Try every written value that fits, score its local musical effect plus
    // the best suffix, then retain the best complete path from this offset.
    const result = DURATION_CANDIDATES.filter(
      (candidate) => cursor + candidate.duration <= end,
    )
      .map((candidate) => {
        const suffix = visit(cursor + candidate.duration);
        return {
          candidates: [candidate, ...suffix.candidates],
          score: scoreCandidate({ candidate, cursor, metric }) + suffix.score,
        };
      })
      .toSorted(comparePaths)[0];
    memo.set(cursor, result);
    return result;
  }

  function comparePaths(left: DurationPath, right: DurationPath): number {
    // Musical penalties decide first; symbol count breaks otherwise equal paths.
    return (
      left.score - right.score ||
      left.candidates.length - right.candidates.length
    );
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
  metric,
}: {
  candidate: DurationCandidate;
  cursor: number;
  metric: MetricContext;
}): number {
  const end = cursor + candidate.duration;
  // Every symbol has a small cost, so equally musical paths stay compact.
  let score = 1;

  // Prefer exposing metric boundaries when symbol count is otherwise equal,
  // while strongly protecting boundaries that are stronger than the onset.
  const startStrength = metricStrength(cursor, metric);
  for (
    let boundary = metric.beatDuration;
    boundary < metric.measureDuration;
    boundary += metric.beatDuration
  ) {
    if (cursor < boundary && end > boundary) {
      score += 1;
      const crossedStrength = metricStrength(boundary, metric);
      if (crossedStrength > startStrength) {
        score += crossedStrength - startStrength;
      }
    }
  }

  // Favor one rhythmic grid within a span. Grid penalties are intentionally
  // soft because some short fallback durations are needed for arbitrary input.
  if (candidate.triplet) {
    const startsOnTripletGrid = cursor % 4 === 0;
    const endsOnTripletGrid = end % 4 === 0;
    score += startsOnTripletGrid && endsOnTripletGrid ? 0 : 12;
  } else if (cursor % 3 !== 0 || end % 3 !== 0) {
    score += 8;
  }
  return score;
}

// Higher values represent progressively stronger positions in common meter.
// The midpoint distinction currently applies only to four-beat measures.
function metricStrength(position: number, metric: MetricContext): number {
  if (position % metric.measureDuration === 0) {
    return 3;
  }
  if (
    metric.measureDuration === 4 * metric.beatDuration &&
    position % (metric.measureDuration / 2) === 0
  ) {
    return 2;
  }
  if (position % metric.beatDuration === 0) {
    return 1;
  }
  return 0;
}
