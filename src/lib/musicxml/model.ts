import type { Locator, Note, TimeSignature } from "../../types";
import { range } from "../../utils/array";
import { parseLocatorLabel } from "../locators";
import {
  type KeySignature,
  type SpelledPitch,
  spellMidiPitch,
} from "../pitch-spelling";
import { resolveTabPosition, type TabPosition } from "../tab-annotation";
import {
  buildMeasureEvents,
  type MetricContext,
  MUSICXML_DIVISIONS,
  type MusicXmlMeasureEvent,
} from "./split-notation";

// Builds the score model from project notes and locators; XML rendering belongs in render.ts.

export type MusicXmlModelOptions = {
  notes: Note[];
  timeSignature: TimeSignature;
  keySignature: KeySignature;
  openStringPitches: readonly number[];
  locators: Locator[];
};

export type MusicXmlModelResult = {
  measureDuration: number;
  measures: MusicXmlMeasure[];
};

export type MusicXmlMeasure = {
  events: MusicXmlMeasureEvent[];
  locators: MusicXmlLocator[];
  keySignature?: KeySignature;
};

export type MusicXmlLocator = {
  label: string;
  offset: number;
};

type PreparedNote = {
  note: Note;
  start: number;
  end: number;
  tabPosition: TabPosition;
};

export type QuantizedNote = PreparedNote & {
  pitch: SpelledPitch;
};

type PreparedLocator = Locator & {
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

export function buildMusicXmlModel({
  notes,
  timeSignature,
  keySignature,
  openStringPitches,
  locators,
}: MusicXmlModelOptions): MusicXmlModelResult {
  if (notes.length === 0) {
    throw new Error("Add at least one note before exporting MusicXML");
  }

  validateOpenStringPitches(openStringPitches);
  // Measure length in MusicXML grid units.
  const measureDuration = toGridUnits(
    timeSignature.numerator * (4 / timeSignature.denominator),
    "time signature",
  );
  const beatDuration =
    timeSignature.denominator === 8 && timeSignature.numerator % 3 === 0
      ? 1.5 * MUSICXML_DIVISIONS
      : (4 / timeSignature.denominator) * MUSICXML_DIVISIONS;
  const preparedNotes = prepareNotes({ notes, openStringPitches });
  const { preparedLocators, keySignatureEvents } = prepareLocators({
    locators,
    measureDuration,
  });
  // Trim empty leading measures and rebase score items to the exported score.
  const firstPosition = Math.min(
    preparedNotes[0].start,
    preparedLocators[0]?.position ?? Infinity,
  );
  const firstMeasureStart =
    Math.floor(firstPosition / measureDuration) * measureDuration;
  const quantizedNotes = preparedNotes.map((note) => ({
    ...note,
    start: note.start - firstMeasureStart,
    end: note.end - firstMeasureStart,
  }));
  const quantizedLocators = preparedLocators.map((locator) => ({
    ...locator,
    position: locator.position - firstMeasureStart,
  }));
  const quantizedKeySignatureEvents = keySignatureEvents.map((event) => ({
    ...event,
    position: event.position - firstMeasureStart,
  }));
  const measureCount = Math.ceil(
    quantizedNotes[quantizedNotes.length - 1].end / measureDuration,
  );
  // Resolve the active key signature for every exported measure.
  const locatorsByMeasure = buildLocatorsByMeasure({
    locators: quantizedLocators,
    measureCount,
    measureDuration,
  });
  const keySignaturesByMeasure = buildKeySignaturesByMeasure({
    initialKeySignature: keySignature,
    events: quantizedKeySignatureEvents,
    measureCount,
    measureDuration,
  });
  const notesByMeasure = buildNotesByMeasure({
    notes: quantizedNotes,
    keySignaturesByMeasure,
    measureCount,
    measureDuration,
  });
  return {
    measureDuration,
    measures: notesByMeasure.map((measureNotes, index) => {
      const measureStart = index * measureDuration;
      const measureKeySignature = keySignaturesByMeasure[index];
      return {
        events: buildMeasureEvents({
          notes: measureNotes,
          measureStart,
          measureDuration,
          metric: {
            measureDuration,
            beatDuration,
          },
        }),
        locators: locatorsByMeasure[index],
        keySignature: measureKeySignature.emit
          ? measureKeySignature.active
          : undefined,
      };
    }),
  };
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

function buildNotesByMeasure({
  notes,
  keySignaturesByMeasure,
  measureCount,
  measureDuration,
}: {
  notes: PreparedNote[];
  keySignaturesByMeasure: MeasureKeySignature[];
  measureCount: number;
  measureDuration: number;
}): QuantizedNote[][] {
  const result: QuantizedNote[][] = range(measureCount).map(() => []);
  // Spell each note in the key where it begins, then assign it to every
  // measure it spans so tied segments retain the original spelling.
  for (const note of notes) {
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
      result[index].push(quantizedNote);
    }
  }
  return result;
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

function buildKeySignaturesByMeasure({
  initialKeySignature,
  events,
  measureCount,
  measureDuration,
}: {
  initialKeySignature: KeySignature;
  events: KeySignatureEvent[];
  measureCount: number;
  measureDuration: number;
}): MeasureKeySignature[] {
  const eventsByMeasure = range(measureCount).map((measureIndex) =>
    events.find((event) => event.position / measureDuration === measureIndex),
  );
  const result: MeasureKeySignature[] = [];
  for (let index = 0; index < measureCount; index++) {
    const previous = index > 0 ? result[index - 1].active : initialKeySignature;
    const active = eventsByMeasure[index]?.keySignature ?? previous;
    result[index] = {
      active,
      emit:
        index === 0 ||
        active.fifths !== previous!.fifths ||
        active.mode !== previous!.mode,
    };
  }
  return result;
}

function buildLocatorsByMeasure({
  locators,
  measureCount,
  measureDuration,
}: {
  locators: PreparedLocator[];
  measureCount: number;
  measureDuration: number;
}): MusicXmlLocator[][] {
  return range(measureCount).map((measureIndex) =>
    locators
      .filter(
        (locator) =>
          locator.label !== "" &&
          Math.floor(locator.position / measureDuration) === measureIndex,
      )
      .map((locator) => ({
        label: locator.label,
        offset: locator.position - measureIndex * measureDuration,
      })),
  );
}

const EPSILON = 1e-6;

function toGridUnits(value: number, label: string): number {
  const units = Math.round(value * MUSICXML_DIVISIONS);
  if (Math.abs(value * MUSICXML_DIVISIONS - units) > EPSILON) {
    throw new Error(`${label} is not aligned to a supported grid`);
  }
  return units;
}

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

function toWrittenBassPitch(pitch: SpelledPitch): SpelledPitch {
  // Bass notation is written one octave above sounding pitch; the matching
  // MusicXML <transpose> metadata shifts playback back down an octave.
  return { ...pitch, octave: pitch.octave + 1 };
}
