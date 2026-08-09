import type { TimeSignature } from "../types";
import type { SpelledPitch } from "./pitch-spelling";
import type { TabPosition } from "./tab-annotation";

export const MUSICXML_DIVISIONS = 12;

// DurationNotation describes the written value. DurationPiece.duration remains
// the performed MusicXML duration, which differs for tuplets.
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

// Raw events preserve authored note boundaries and make every implicit silence
// explicit before notation values are chosen. Decomposition must never merge
// across one of these note/rest boundaries.
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

// Ordered longest-first so equal-symbol paths prefer longer values. Placement
// belongs to the metric heuristic below rather than to absolute alignments in
// this vocabulary.
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
  // Build the complete measure first so future tuplet detection can inspect
  // neighboring notes and rests before either side is decomposed.
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
    // Notes may be assigned to every measure they overlap. Keep both clipped
    // and original bounds so notation is measure-local while ties remain aware
    // of continuations across barlines.
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
  // Raw boundaries are fixed, but notation splits inside one raw event are
  // chosen as a complete path instead of making irreversible greedy choices.
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
      // Every internal split and clipped barline segment belongs to one tied
      // chain. A single unsplit note has neither marker.
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
    // Compound x/8 meters group three eighth notes into one dotted-quarter
    // beat. Other supported meters use the denominator as the beat unit.
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
  // The search space is tiny, but memoization makes the complete-path search
  // linear in reachable grid offsets rather than repeatedly exploring suffixes.
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
      // Candidate order breaks equal-length ties, preserving the longest-first
      // vocabulary preference without sacrificing global symbol minimization.
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
    // This retains the exporter's existing triplet placement behavior for now.
    // Measure-wide tuplet regions will replace this absolute phase check so an
    // equivalent triplet decomposes identically on every beat.
    return cursor % candidate.duration === 0;
  }

  const end = cursor + candidate.duration;
  // Ordinary beat-sized and longer values start on their own metric raster.
  // This prevents a dotted value from winning merely because it fits the
  // remaining arithmetic duration while crossing stronger beat structure.
  if (
    candidate.duration >= metric.beatDuration &&
    cursor % candidate.duration !== 0
  ) {
    return false;
  }
  // In 4/4, preserve the central accent for notes. This is the first concrete
  // boundary-strength rule; a later metric hierarchy can generalize it across
  // time signatures and apply stricter tolerances to rests.
  if (durationType === "note" && metric.measureDuration === 48) {
    const midpoint = metric.measureDuration / 2;
    if (cursor < midpoint && end > midpoint) {
      return false;
    }
  }
  return true;
}
