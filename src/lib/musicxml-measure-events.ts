import type { TimeSignature } from "../types";
import type { SpelledPitch } from "./pitch-spelling";
import type { TabPosition } from "./tab-annotation";

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

type RawMeasureEvent =
  | { type: "rest"; start: number; end: number }
  | {
      type: "note";
      start: number;
      end: number;
      originalStart: number;
      originalEnd: number;
      pitch: SpelledPitch;
      tabPosition: TabPosition;
    };

type DurationPiece = {
  duration: number;
  notation: DurationNotation;
};

type MetricContext = {
  measureDuration: number;
  beatDuration: number;
};

const DURATION_CANDIDATES: DurationPiece[] = [
  { duration: 48, notation: { type: "whole" } },
  { duration: 36, notation: { type: "half", dots: 1 } },
  { duration: 32, notation: { type: "whole", triplet: true } },
  { duration: 24, notation: { type: "half" } },
  { duration: 18, notation: { type: "quarter", dots: 1 } },
  { duration: 16, notation: { type: "half", triplet: true } },
  { duration: 12, notation: { type: "quarter" } },
  { duration: 9, notation: { type: "eighth", dots: 1 } },
  { duration: 8, notation: { type: "quarter", triplet: true } },
  { duration: 6, notation: { type: "eighth" } },
  { duration: 4, notation: { type: "eighth", triplet: true } },
  { duration: 3, notation: { type: "16th" } },
  { duration: 2, notation: { type: "16th", triplet: true } },
  { duration: 1, notation: { type: "32nd", triplet: true } },
];

export function buildMeasureEvents({
  notes,
  measureStart,
  measureDuration,
  timeSignature,
}: {
  notes: MeasureNote[];
  measureStart: number;
  measureDuration: number;
  timeSignature: TimeSignature;
}): MusicXmlMeasureEvent[] {
  const timeline = buildRawTimeline({ notes, measureStart, measureDuration });
  const metric = buildMetricContext({ timeSignature });

  return timeline.flatMap((event) => decomposeEvent({ event, metric }));
}

function buildRawTimeline({
  notes,
  measureStart,
  measureDuration,
}: {
  notes: MeasureNote[];
  measureStart: number;
  measureDuration: number;
}): RawMeasureEvent[] {
  const events: RawMeasureEvent[] = [];
  let cursor = 0;

  for (const note of notes) {
    const originalStart = note.start - measureStart;
    const originalEnd = note.end - measureStart;
    const start = Math.max(originalStart, 0);
    const end = Math.min(originalEnd, measureDuration);

    if (start > cursor) {
      events.push({ type: "rest", start: cursor, end: start });
    }
    events.push({
      type: "note",
      start,
      end,
      originalStart,
      originalEnd,
      pitch: note.pitch,
      tabPosition: note.tabPosition,
    });
    cursor = end;
  }

  if (cursor < measureDuration) {
    events.push({ type: "rest", start: cursor, end: measureDuration });
  }
  return events;
}

function decomposeEvent({
  event,
  metric,
}: {
  event: RawMeasureEvent;
  metric: MetricContext;
}): MusicXmlMeasureEvent[] {
  const pieces = findFewestPieces({
    start: event.start,
    end: event.end,
    durationType: event.type,
    metric,
  });

  if (event.type === "rest") {
    return pieces.map((piece) => ({ type: "rest", ...piece }));
  }

  let cursor = event.start;
  return pieces.map((piece) => {
    const pieceEnd = cursor + piece.duration;
    const result: MusicXmlMeasureEvent = {
      type: "note",
      pitch: event.pitch,
      duration: piece.duration,
      notation: piece.notation,
      tabPosition: event.tabPosition,
      tieStart: pieceEnd < event.originalEnd,
      tieStop: cursor > event.originalStart,
    };
    cursor = pieceEnd;
    return result;
  });
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

function findFewestPieces({
  start,
  end,
  durationType,
  metric,
}: {
  start: number;
  end: number;
  durationType: "note" | "rest";
  metric: MetricContext;
}): DurationPiece[] {
  const memo = new Map<number, DurationPiece[]>();

  function visit(cursor: number): DurationPiece[] {
    if (cursor === end) {
      return [];
    }
    const cached = memo.get(cursor);
    if (cached) {
      return cached;
    }

    const result = DURATION_CANDIDATES.filter(
      (candidate) =>
        cursor + candidate.duration <= end &&
        isValidPlacement({ candidate, cursor, durationType, metric }),
    )
      .map((candidate) => [candidate, ...visit(cursor + candidate.duration)])
      .toSorted((left, right) => left.length - right.length)[0];
    memo.set(cursor, result);
    return result;
  }

  return visit(start);
}

function isValidPlacement({
  candidate,
  cursor,
  durationType,
  metric,
}: {
  candidate: DurationPiece;
  cursor: number;
  durationType: "note" | "rest";
  metric: MetricContext;
}): boolean {
  if (candidate.notation.triplet) {
    return cursor % candidate.duration === 0;
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
