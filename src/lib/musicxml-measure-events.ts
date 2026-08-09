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

// Raw events preserve authored note boundaries and make every implicit silence
// explicit. Notation decomposition may split them, but never merge across them.
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

type MetricBoundary = {
  position: number;
  strength: number;
};

type TripletRegion = {
  start: number;
  end: number;
};

type MeasureContext = {
  boundaries: MetricBoundary[];
  triplets: TripletRegion[];
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
  { duration: 1, notation: { type: "32nd" } },
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
  // The complete timeline determines local tuplets before either neighboring
  // note or rest is decomposed. Every event then shares this measure context.
  const context = buildMeasureContext({
    timeline,
    measureDuration,
    timeSignature,
  });
  return timeline.flatMap((event) => decomposeEvent({ event, context }));
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
    // A note may be assigned to every measure it overlaps. Keep original bounds
    // for ties while clipping the rhythmic event to this measure.
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

function buildMeasureContext({
  timeline,
  measureDuration,
  timeSignature,
}: {
  timeline: RawMeasureEvent[];
  measureDuration: number;
  timeSignature: TimeSignature;
}): MeasureContext {
  const beatDuration = getBeatDuration(timeSignature);
  const boundaries: MetricBoundary[] = [
    { position: 0, strength: 3 },
    { position: measureDuration, strength: 3 },
  ];
  for (
    let position = beatDuration;
    position < measureDuration;
    position += beatDuration
  ) {
    boundaries.push({
      position,
      strength: position * 2 === measureDuration ? 2 : 1,
    });
  }
  return {
    boundaries,
    triplets: detectTripletRegions({ timeline, beatDuration, measureDuration }),
  };
}

function getBeatDuration(timeSignature: TimeSignature): number {
  // Compound x/8 meters group three eighth notes into one dotted-quarter beat.
  if (timeSignature.denominator === 8 && timeSignature.numerator % 3 === 0) {
    return 1.5 * MUSICXML_DIVISIONS;
  }
  return (4 / timeSignature.denominator) * MUSICXML_DIVISIONS;
}

function detectTripletRegions({
  timeline,
  beatDuration,
  measureDuration,
}: {
  timeline: RawMeasureEvent[];
  beatDuration: number;
  measureDuration: number;
}): TripletRegion[] {
  // Initial support is deliberately limited to 3:2 eighth-note tuplets in one
  // quarter-note beat. A region needs an authored note boundary on the triplet
  // grid so ordinary all-silent or binary beats are never inferred as tuplets.
  if (beatDuration !== MUSICXML_DIVISIONS) {
    return [];
  }
  const noteBoundaries = timeline
    .filter((event) => event.type === "note")
    .flatMap((event) => [event.start, event.end]);
  const regions: TripletRegion[] = [];
  for (let start = 0; start < measureDuration; start += beatDuration) {
    const end = start + beatDuration;
    const hasTripletBoundary = noteBoundaries.some((position) => {
      const offset = position - start;
      return (
        offset === MUSICXML_DIVISIONS / 3 ||
        offset === (2 * MUSICXML_DIVISIONS) / 3
      );
    });
    if (hasTripletBoundary) {
      regions.push({ start, end });
    }
  }
  return regions;
}

function decomposeEvent({
  event,
  context,
}: {
  event: RawMeasureEvent;
  context: MeasureContext;
}): MusicXmlMeasureEvent[] {
  // Split first at tuplet boundaries because no written value can cross into or
  // out of a tuplet. Metric boundaries remain weighted choices in the search.
  const regionEdges = context.triplets.flatMap(({ start, end }) => [
    start,
    end,
  ]);
  const points = [
    event.start,
    ...regionEdges.filter((point) => point > event.start && point < event.end),
    event.end,
  ].toSorted((left, right) => left - right);
  const pieces = points.slice(0, -1).flatMap((start, index) =>
    findBestPieces({
      start,
      end: points[index + 1],
      durationType: event.type,
      context,
    }),
  );

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

function findBestPieces({
  start,
  end,
  durationType,
  context,
}: {
  start: number;
  end: number;
  durationType: "note" | "rest";
  context: MeasureContext;
}): DurationPiece[] {
  const memo = new Map<number, DurationPiece[] | undefined>();
  const triplet = context.triplets.find(
    (region) => start >= region.start && end <= region.end,
  );

  function visit(cursor: number): DurationPiece[] | undefined {
    if (cursor === end) {
      return [];
    }
    if (memo.has(cursor)) {
      return memo.get(cursor);
    }
    const paths: DurationPiece[][] = [];
    for (const candidate of DURATION_CANDIDATES) {
      if (
        cursor + candidate.duration > end ||
        Boolean(candidate.notation.triplet) !== Boolean(triplet)
      ) {
        continue;
      }
      const suffix = visit(cursor + candidate.duration);
      if (suffix !== undefined) {
        paths.push([candidate, ...suffix]);
      }
    }
    const result = paths.toSorted((left, right) =>
      comparePaths({
        left,
        right,
        start: cursor,
        durationType,
        context,
      }),
    )[0];
    memo.set(cursor, result);
    return result;
  }
  const result = visit(start);
  if (!result) {
    throw new Error(
      `Cannot decompose ${durationType} from ${start} to ${end}${triplet ? " inside triplet" : ""}`,
    );
  }
  return result;
}

function comparePaths({
  left,
  right,
  start,
  durationType,
  context,
}: {
  left: DurationPiece[];
  right: DurationPiece[];
  start: number;
  durationType: "note" | "rest";
  context: MeasureContext;
}): number {
  const leftCost = pathCost({ pieces: left, start, durationType, context });
  const rightCost = pathCost({ pieces: right, start, durationType, context });
  return leftCost - rightCost || left.length - right.length;
}

function pathCost({
  pieces,
  start,
  durationType,
  context,
}: {
  pieces: DurationPiece[];
  start: number;
  durationType: "note" | "rest";
  context: MeasureContext;
}): number {
  let cursor = start;
  let cost = 0;
  for (const piece of pieces) {
    const end = cursor + piece.duration;
    for (const boundary of context.boundaries) {
      if (boundary.position > cursor && boundary.position < end) {
        if (
          durationType === "rest" &&
          cursor % piece.duration === 0 &&
          end % piece.duration === 0
        ) {
          continue;
        }
        // Rests preserve every beat boundary. Notes may cross weak beat
        // boundaries, but not the stronger midpoint or measure boundaries.
        const tolerance = durationType === "note" ? 1 : 0;
        cost += Math.max(0, boundary.strength - tolerance) * 100;
      }
    }
    cursor = end;
  }
  return cost;
}
