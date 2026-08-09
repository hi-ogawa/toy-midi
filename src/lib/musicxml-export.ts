import type { Locator, Note, TimeSignature } from "../types";
import { parseLocatorLabel } from "./locators";
import {
  type KeySignature,
  type SpelledPitch,
  spellChromaticPitch,
  spellMidiPitch,
} from "./pitch-spelling";
import { resolveTabPosition, type TabPosition } from "./tab-annotation";

// This format was manually reduced from a MuseScore MusicXML export and
// iterated through MuseScore import/export in PR #212. In particular, the two
// explicit staves and the <backup> between their duplicated note streams are
// required for standard notation and TAB to import together while preserving
// explicit string/fret assignments.

// MusicXML durations are integer multiples of divisions per quarter note.
// Twelve is divisible by 2, 3, and 4, so eighth, triplet, and 16th-note
// subdivisions are represented without rounding.
const DIVISIONS = 12;
const EPSILON = 1e-6;

export type MusicXmlModelOptions = {
  notes: Note[];
  timeSignature: TimeSignature;
  keySignature: KeySignature;
  openStringPitches: readonly number[];
  locators: Locator[];
};

export type MusicXmlExportOptions = MusicXmlModelOptions & {
  tempo: number;
  title: string;
};

export type MusicXmlMeasure = {
  events: MusicXmlMeasureEvent[];
  locators: { label: string; offset: number }[];
  keySignature?: KeySignature;
};

type PreparedNote = {
  note: Note;
  start: number;
  end: number;
  tabPosition: TabPosition;
};

type QuantizedNote = PreparedNote & {
  pitch: SpelledPitch;
};

type PreparedLocator = {
  id: string;
  position: number;
  label: string;
  keySignature?: KeySignature;
};

type KeySignatureEvent = {
  position: number;
  keySignature: KeySignature;
};

type MeasureKeySignature = {
  active: KeySignature;
  emit: boolean;
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

type DurationNotation = {
  type: string;
  dots?: number;
  triplet?: boolean;
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

// Model preprocessing
export function buildMusicXmlModel({
  notes,
  timeSignature,
  keySignature,
  openStringPitches,
  locators,
}: MusicXmlModelOptions): {
  measureDuration: number;
  measures: MusicXmlMeasure[];
} {
  if (notes.length === 0) {
    throw new Error("Add at least one note before exporting MusicXML");
  }

  validateOpenStringPitches(openStringPitches);
  // Measure length in MusicXML grid units.
  const measureDuration = toGridUnits(
    timeSignature.numerator * (4 / timeSignature.denominator),
    "time signature",
  );
  const preparedNotes = prepareNotes({ notes, openStringPitches });
  // Trim empty leading measures and rebase notes to the exported score.
  const firstMeasureStart =
    Math.floor(preparedNotes[0].start / measureDuration) * measureDuration;
  const quantizedNotes = preparedNotes.map((note) => ({
    ...note,
    start: note.start - firstMeasureStart,
    end: note.end - firstMeasureStart,
  }));
  const measureCount = Math.ceil(
    quantizedNotes[quantizedNotes.length - 1].end / measureDuration,
  );
  // Resolve the active key signature for every exported measure.
  const { preparedLocators, keySignatureEvents } = prepareLocators({
    locators,
    measureDuration,
  });
  const keySignaturesByMeasure = buildMeasureKeySignatures({
    initialKeySignature: keySignature,
    events: keySignatureEvents,
    firstMeasureStart,
    measureCount,
    measureDuration,
  });
  // Spell each note in the key where it begins, then assign it to every
  // measure it spans so tied segments retain the original spelling.
  const notesByMeasure = Array.from(
    { length: measureCount },
    () => [] as QuantizedNote[],
  );
  for (const note of quantizedNotes) {
    const firstMeasure = Math.floor(note.start / measureDuration);
    const lastMeasure = Math.ceil(note.end / measureDuration) - 1;
    const quantizedNote: QuantizedNote = {
      ...note,
      pitch: toWrittenBassPitch(
        spellMidiPitch({
          pitch: note.note.pitch,
          keySignature: keySignaturesByMeasure[firstMeasure].active,
        }),
      ),
    };
    for (let index = firstMeasure; index <= lastMeasure; index++) {
      notesByMeasure[index].push(quantizedNote);
    }
  }
  return {
    measureDuration,
    measures: notesByMeasure.map((notes, index) => {
      const measureStart = index * measureDuration;
      const measureKeySignature = keySignaturesByMeasure[index];
      return {
        events: buildMeasureEvents({
          notes,
          measureStart,
          measureDuration,
        }),
        locators: buildMeasureLocators({
          locators: preparedLocators,
          firstMeasureStart,
          measureStart,
          measureDuration,
        }),
        keySignature: measureKeySignature.emit
          ? measureKeySignature.active
          : undefined,
      };
    }),
  };
}

function prepareLocators({
  locators,
  measureDuration,
}: {
  locators: Locator[];
  measureDuration: number;
}): {
  preparedLocators: PreparedLocator[];
  keySignatureEvents: KeySignatureEvent[];
} {
  const preparedLocators: PreparedLocator[] = [];
  const keySignatureEvents: KeySignatureEvent[] = [];
  for (const locator of locators.toSorted((a, b) => a.position - b.position)) {
    const position = toGridUnits(
      locator.position,
      `position of locator ${locator.id}`,
    );
    const parsed = parseLocatorLabel(locator);
    if (parsed.keySignature && position <= 0) {
      throw new Error(
        `Key signature locator ${locator.id} must be after beat 0; use the project key signature for the initial key`,
      );
    }
    if (parsed.keySignature && position % measureDuration !== 0) {
      throw new Error(
        `Key signature locator ${locator.id} must be at the start of a measure`,
      );
    }
    if (parsed.keySignature) {
      if (keySignatureEvents.at(-1)?.position === position) {
        throw new Error(
          "Multiple key signature locators are at the same measure",
        );
      }
      keySignatureEvents.push({
        position,
        keySignature: parsed.keySignature,
      });
    }
    preparedLocators.push({ id: locator.id, position, ...parsed });
  }
  return { preparedLocators, keySignatureEvents };
}

function buildMeasureKeySignatures({
  initialKeySignature,
  events,
  firstMeasureStart,
  measureCount,
  measureDuration,
}: {
  initialKeySignature: KeySignature;
  events: KeySignatureEvent[];
  firstMeasureStart: number;
  measureCount: number;
  measureDuration: number;
}): MeasureKeySignature[] {
  let active = initialKeySignature;
  let eventIndex = 0;
  return Array.from({ length: measureCount }, (_, measureIndex) => {
    const position = firstMeasureStart + measureIndex * measureDuration;
    let emit = false;
    while (events[eventIndex]?.position <= position) {
      const event = events[eventIndex];
      active = event.keySignature;
      if (event.position === position) {
        emit = true;
      }
      eventIndex++;
    }
    return { active, emit: measureIndex === 0 || emit };
  });
}

function buildMeasureLocators({
  locators,
  firstMeasureStart,
  measureStart,
  measureDuration,
}: {
  locators: PreparedLocator[];
  firstMeasureStart: number;
  measureStart: number;
  measureDuration: number;
}): MusicXmlMeasure["locators"] {
  return locators
    .filter((locator) => locator.label !== "")
    .map((locator) => ({
      label: locator.label,
      offset: locator.position - firstMeasureStart - measureStart,
    }))
    .filter(({ offset }) => offset >= 0 && offset < measureDuration)
    .sort((a, b) => a.offset - b.offset);
}

/** Quantizes notes, resolves TAB positions, orders them, and rejects polyphony. */
function prepareNotes({
  notes,
  openStringPitches,
}: {
  notes: Note[];
  openStringPitches: readonly number[];
}): PreparedNote[] {
  const result = notes
    .map((note) => {
      const start = toGridUnits(note.start, `start of note ${note.id}`);
      const duration = toGridUnits(
        note.duration,
        `duration of note ${note.id}`,
      );
      if (start < 0) {
        throw new Error(`Note ${note.id} starts before beat 0`);
      }
      if (duration <= 0) {
        throw new Error(`Note ${note.id} must have a positive duration`);
      }
      const tabPosition = resolveTabPosition({
        pitch: note.pitch,
        openStringPitches,
        tabString: note.tabString,
      });
      if (!tabPosition) {
        throw new Error(
          `MIDI note ${note.pitch} is not playable on a ${openStringPitches.length}-string bass`,
        );
      }
      return { note, start, end: start + duration, tabPosition };
    })
    .sort((a, b) => a.start - b.start || a.note.pitch - b.note.pitch);

  // TODO: Support strict chords first. Partial overlaps can be authored as split
  // monophonic notes, but simultaneous notes cannot be represented without
  // MusicXML <chord/>. Group identical start/end times, assign distinct TAB
  // strings, and leave unequal-duration overlaps for future voice scheduling.
  for (let index = 1; index < result.length; index++) {
    if (result[index].start < result[index - 1].end) {
      throw new Error(
        `Polyphonic or overlapping notes ${result[index - 1].note.id} and ${result[index].note.id} are not supported`,
      );
    }
  }
  return result;
}

/** Clips notes to one measure and fills its timeline with notated notes and rests. */
function buildMeasureEvents({
  notes,
  measureStart,
  measureDuration,
}: {
  notes: QuantizedNote[];
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
    // Prefer the longest notation value that starts on its valid beat boundary.
    const candidate = DURATION_CANDIDATES.find(
      (item) => item.duration <= remaining && cursor % item.alignment === 0,
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

/** Converts quarter-note beats to integer MusicXML divisions and rejects off-grid values. */
function toGridUnits(value: number, label: string): number {
  const units = Math.round(value * DIVISIONS);
  if (Math.abs(value * DIVISIONS - units) > EPSILON) {
    throw new Error(`${label} is not aligned to a supported grid`);
  }
  return units;
}

/** Validates a non-empty tuning of MIDI note numbers. */
function validateOpenStringPitches(pitches: readonly number[]): void {
  if (pitches.length === 0) {
    throw new Error("Add at least one open string before exporting MusicXML");
  }
  if (
    pitches.some(
      (pitch) => !Number.isInteger(pitch) || pitch < 0 || pitch > 127,
    )
  ) {
    throw new Error("Open-string pitches must be MIDI note numbers");
  }
}

// XML serialization
export function exportMusicXml({
  notes,
  tempo,
  title,
  timeSignature,
  keySignature,
  openStringPitches,
  locators,
}: MusicXmlExportOptions): string {
  const { measureDuration, measures } = buildMusicXmlModel({
    notes,
    timeSignature,
    keySignature,
    openStringPitches,
    locators,
  });
  // MusicXML places score-level configuration inside the first measure.
  const initialMeasureChildren = [
    hx(
      "attributes",
      hx("divisions", DIVISIONS),
      hx(
        "time",
        hx("beats", timeSignature.numerator),
        hx("beat-type", timeSignature.denominator),
      ),
      hx("staves", 2),
      h("clef", { number: 1 }, hx("sign", "F"), hx("line", 4)),
      h("clef", { number: 2 }, hx("sign", "TAB")),
      renderStaffDetails(openStringPitches),
      // Bass sounds one octave below its written pitch, so MuseScore transposes
      // playback while retaining conventional bass notation.
      hx(
        "transpose",
        hx("diatonic", 0),
        hx("chromatic", 0),
        hx("octave-change", -1),
      ),
    ),
    h(
      "direction",
      { placement: "above" },
      hx(
        "direction-type",
        h(
          "metronome",
          { parentheses: "no" },
          hx("beat-unit", "quarter"),
          hx("per-minute", tempo),
        ),
      ),
      hx("staff", 1),
      h("sound", { tempo }),
    ),
  ];

  const document = h(
    "score-partwise",
    { version: "4.0" },
    hx("work", hx("work-title", title)),
    // TODO: Populate part and MIDI instrument metadata from Toy MIDI instrument
    // data instead of hard-coding Electric Bass when non-bass export is supported.
    hx(
      "part-list",
      h(
        "score-part",
        { id: "P1" },
        h(
          "score-instrument",
          { id: "P1-I1" },
          hx("instrument-name", "Electric Bass"),
          hx("instrument-sound", "pluck.bass.electric"),
        ),
        h(
          "midi-instrument",
          { id: "P1-I1" },
          hx("midi-channel", 1),
          hx("midi-program", 34),
        ),
      ),
    ),
    h(
      "part",
      { id: "P1" },
      ...measures.map((measure, index) =>
        renderMeasure({
          measure,
          index,
          measureDuration,
          initialChildren: index === 0 ? initialMeasureChildren : [],
        }),
      ),
    ),
  );

  return `\
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
${renderXml(document)}
`;
}

function renderMeasure({
  measure,
  index,
  measureDuration,
  initialChildren,
}: {
  measure: MusicXmlMeasure;
  index: number;
  measureDuration: number;
  initialChildren: XmlNode[];
}): XmlElement {
  // Rewind the measure cursor so staff 2 runs in parallel with staff 1.
  return h(
    "measure",
    { number: index + 1 },
    ...initialChildren,
    measure.keySignature &&
      hx("attributes", renderKeySignature(measure.keySignature)),
    ...measure.locators.map(renderRehearsalDirection),
    ...measure.events.map((event) => renderEvent(event, 1)),
    hx("backup", hx("duration", measureDuration)),
    ...measure.events.map((event) => renderEvent(event, 2)),
  );
}

function renderKeySignature(keySignature: KeySignature): XmlElement {
  return hx(
    "key",
    hx("fifths", keySignature.fifths),
    hx("mode", keySignature.mode),
  );
}

function renderRehearsalDirection({
  label,
  offset,
}: {
  label: string;
  offset: number;
}): XmlElement {
  return h(
    "direction",
    { placement: "above" },
    hx("direction-type", hx("rehearsal", label)),
    offset > 0 && hx("offset", offset),
    hx("staff", 1),
  );
}

function renderStaffDetails(openStringPitches: readonly number[]): XmlElement {
  // The app stores strings from highest to lowest pitch, while MusicXML numbers
  // TAB staff lines from the lowest line upward.
  const tuning = [...openStringPitches].reverse();
  return h(
    "staff-details",
    { number: 2 },
    hx("staff-lines", openStringPitches.length),
    ...tuning.map((midi, index) => {
      const pitch = toWrittenBassPitch(spellChromaticPitch(midi));
      return h(
        "staff-tuning",
        { line: index + 1 },
        hx("tuning-step", pitch.step),
        pitch.alter !== 0 && hx("tuning-alter", pitch.alter),
        hx("tuning-octave", pitch.octave),
      );
    }),
  );
}

function renderEvent(event: MusicXmlMeasureEvent, staff: 1 | 2): XmlElement {
  // MuseScore allocates four voice IDs per staff, so the first voices of staff 1
  // and staff 2 are 1 and 5 respectively.
  const voice = staff === 1 ? 1 : 5;
  if (event.type === "rest") {
    return hx(
      "note",
      hx("rest"),
      hx("duration", event.duration),
      hx("voice", voice),
      ...renderDurationNotation(event.notation),
      hx("staff", staff),
    );
  }

  // MusicXML uses <tie> for playback and <tied> for engraved notation, so each
  // model tie must be emitted in both forms.
  const tiedNotations = [
    event.tieStop && h("tied", { type: "stop" }),
    event.tieStart && h("tied", { type: "start" }),
  ];
  const technical =
    staff === 2 &&
    hx(
      "technical",
      hx("string", event.tabPosition.tabString),
      hx("fret", event.tabPosition.fret),
    );

  return hx(
    "note",
    hx(
      "pitch",
      hx("step", event.pitch.step),
      event.pitch.alter !== 0 && hx("alter", event.pitch.alter),
      hx("octave", event.pitch.octave),
    ),
    hx("duration", event.duration),
    event.tieStop && h("tie", { type: "stop" }),
    event.tieStart && h("tie", { type: "start" }),
    hx("voice", voice),
    ...renderDurationNotation(event.notation),
    hx("staff", staff),
    (tiedNotations.some(Boolean) || technical) &&
      hx("notations", ...tiedNotations, technical),
  );
}

function renderDurationNotation(notation: DurationNotation): XmlNode[] {
  return [
    hx("type", notation.type),
    ...Array.from({ length: notation.dots ?? 0 }, () => hx("dot")),
    notation.triplet &&
      hx("time-modification", hx("actual-notes", 3), hx("normal-notes", 2)),
  ];
}

function toWrittenBassPitch(pitch: SpelledPitch): SpelledPitch {
  // Bass notation is written one octave above sounding pitch; the matching
  // MusicXML <transpose> metadata shifts playback back down an octave.
  return { ...pitch, octave: pitch.octave + 1 };
}

// xml hyperscript helpers

type XmlNode = string | number | false | undefined | XmlElement;

type XmlElement = {
  tag: string;
  attributes?: Record<string, string | number | undefined>;
  children: XmlNode[];
};

function h(
  tag: string,
  attributes?: XmlElement["attributes"],
  ...children: XmlNode[]
): XmlElement {
  return { tag, attributes, children };
}

function hx(tag: string, ...children: XmlNode[]): XmlElement {
  return h(tag, undefined, ...children);
}

function renderXml(node: XmlNode, depth = 0): string {
  if (node === false || node === undefined) {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return escapeXml(String(node));
  }
  const indent = "  ".repeat(depth);
  const attributes = Object.entries(node.attributes ?? {})
    .filter(
      (entry): entry is [string, string | number] => entry[1] !== undefined,
    )
    .map(([name, value]) => ` ${name}="${escapeXml(String(value))}"`)
    .join("");
  const children = node.children.filter(
    (child) => child !== false && child !== undefined,
  );
  if (children.length === 0) {
    return `${indent}<${node.tag}${attributes}/>`;
  }
  if (
    children.every(
      (child) => typeof child === "string" || typeof child === "number",
    )
  ) {
    return `${indent}<${node.tag}${attributes}>${children.map((child) => renderXml(child)).join("")}</${node.tag}>`;
  }
  return `${indent}<${node.tag}${attributes}>
${children.map((child) => renderXml(child, depth + 1)).join("\n")}
${indent}</${node.tag}>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
