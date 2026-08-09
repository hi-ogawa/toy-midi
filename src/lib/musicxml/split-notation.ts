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

/** Decomposes a grid duration into the longest notation values valid at each offset. */
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
  const result: { duration: number; notation: DurationNotation }[] = [];
  let cursor = start;
  let remaining = duration;
  while (remaining > 0) {
    const candidate = DURATION_CANDIDATES.find(
      (item) =>
        item.duration <= remaining &&
        isValidPlacement({ candidate: item, cursor, durationType, metric }),
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

function isValidPlacement({
  candidate,
  cursor,
  durationType,
  metric,
}: {
  candidate: DurationCandidate;
  cursor: number;
  durationType: "note" | "rest";
  metric: MetricContext;
}): boolean {
  if (candidate.triplet) {
    return (
      cursor % candidate.duration === 0 ||
      (candidate.duration <= MUSICXML_DIVISIONS &&
        (cursor + candidate.duration) % MUSICXML_DIVISIONS === 0)
    );
  }

  const end = cursor + candidate.duration;
  if (
    candidate.duration >= metric.beatDuration &&
    cursor % candidate.duration !== 0
  ) {
    return false;
  }
  if (durationType === "note" && metric.measureDuration === 48) {
    const midpoint = metric.measureDuration / 2;
    if (cursor < midpoint && end > midpoint) {
      return false;
    }
  }
  return true;
}
