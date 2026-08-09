import type { Locator, Note } from "../types";
import { range } from "../utils/array";
import { exportMusicXml } from "./musicxml/export";
import type { KeySignature } from "./pitch-spelling";
import { TAB_STRING_PRESETS } from "./tab-annotation";

export type ScoreViewerSample = {
  name: string;
  description: string;
  tempo: number;
  xml: string;
};

type ScoreViewerSampleDefinition = Omit<ScoreViewerSample, "xml"> & {
  notes: Note[];
  locators?: Locator[];
  keySignature?: KeySignature;
};

const SAMPLE_PITCHES = [40, 43, 45, 47, 48, 47, 45, 43];

export const SCORE_VIEWER_SAMPLES: ScoreViewerSample[] = [
  createSample({
    name: "Cursor and wrapping",
    description: "64 eighth notes at 120 BPM",
    tempo: 120,
    notes: createSequentialNotes({ count: 64, duration: 0.5 }),
  }),
  createSample({
    name: "Rhythm and rests",
    description: "Mixed durations, gaps, and a full-measure rest",
    tempo: 120,
    notes: [
      createNote({ pitch: 40, start: 0, duration: 1 }),
      createNote({ pitch: 43, start: 1, duration: 0.5 }),
      createNote({ pitch: 45, start: 1.5, duration: 0.25 }),
      createNote({ pitch: 47, start: 1.75, duration: 0.25 }),
      createNote({ pitch: 48, start: 2.5, duration: 1.5 }),
      createNote({ pitch: 47, start: 8, duration: 0.75 }),
      createNote({ pitch: 45, start: 8.75, duration: 0.25 }),
      createNote({ pitch: 43, start: 9.5, duration: 0.5 }),
      createNote({ pitch: 40, start: 10.5, duration: 1.5 }),
    ],
  }),
  createSample({
    name: "Ties and barlines",
    description: "Durations split within and across measures",
    tempo: 120,
    notes: [
      createNote({ pitch: 40, start: 0, duration: 2.5 }),
      createNote({ pitch: 43, start: 2.5, duration: 2.5 }),
      createNote({ pitch: 45, start: 5, duration: 2.5 }),
      createNote({ pitch: 47, start: 7.5, duration: 2.5 }),
      createNote({ pitch: 48, start: 10, duration: 2 }),
    ],
  }),
  createSample({
    name: "TAB positions",
    description: "Open strings and explicit alternate-string frets",
    tempo: 120,
    notes: [
      createNote({ pitch: 40, start: 0, duration: 1 }),
      createNote({ pitch: 45, start: 1, duration: 1 }),
      createNote({
        pitch: 45,
        start: 2,
        duration: 1,
        tabString: 3,
      }),
      createNote({
        pitch: 40,
        start: 3,
        duration: 1,
        tabString: 4,
      }),
      createNote({ pitch: 28, start: 4, duration: 1 }),
      createNote({ pitch: 33, start: 5, duration: 1 }),
      createNote({ pitch: 38, start: 6, duration: 1 }),
      createNote({ pitch: 43, start: 7, duration: 1 }),
    ],
  }),
  createSample({
    name: "Dense sixteenths",
    description: "16th-note funk density at 110 BPM",
    tempo: 110,
    notes: createSequentialNotes({ count: 96, duration: 0.25 }),
  }),
  createSample({
    name: "Fast eighths",
    description: "Fast cursor and following at 200 BPM",
    tempo: 200,
    notes: createSequentialNotes({ count: 96, duration: 0.5 }),
    keySignature: { fifths: -3, mode: "minor" },
  }),
  createSample({
    name: "Long score",
    description: "64 measures of mixed eighths and sixteenths",
    tempo: 110,
    notes: createPrintNotes(),
    keySignature: { fifths: -3, mode: "minor" },
  }),
  createSample({
    name: "Rehearsal marks",
    description: "Boxed section labels at measure and mid-measure positions",
    tempo: 120,
    notes: createSequentialNotes({ count: 32, duration: 0.5 }),
    locators: [
      createLocator({ position: 0, label: "A" }),
      createLocator({ position: 6, label: "B" }),
      createLocator({ position: 12, label: "C" }),
    ],
  }),
  createSample({
    name: "Key changes",
    description:
      "Tied accidentals and diatonic notes across flat and sharp keys",
    tempo: 120,
    notes: [
      // A# crosses into G-flat major, where the following pitch is spelled Bb.
      createNote({ pitch: 34, start: 3.5, duration: 1 }),
      createNote({ pitch: 34, start: 5, duration: 1 }),
      // Gb, Bb, and Db are diatonic in G-flat major.
      createNote({ pitch: 42, start: 6, duration: 0.5 }),
      createNote({ pitch: 46, start: 6.5, duration: 0.5 }),
      createNote({ pitch: 49, start: 7, duration: 1 }),
      // F#, A#, and C# are diatonic in F-sharp major.
      createNote({ pitch: 42, start: 8, duration: 1 }),
      createNote({ pitch: 46, start: 9, duration: 1 }),
      createNote({ pitch: 49, start: 10, duration: 1 }),
    ],
    locators: [
      createLocator({ position: 4, label: "G-flat major [!key: Gb major]" }),
      createLocator({ position: 8, label: "F-sharp major [!key: F# major]" }),
    ],
  }),
];

function createSequentialNotes({
  count,
  duration,
}: {
  count: number;
  duration: number;
}) {
  return range(count).map((index) =>
    createNote({
      pitch: SAMPLE_PITCHES[index % SAMPLE_PITCHES.length],
      start: index * duration,
      duration,
    }),
  );
}

function createPrintNotes() {
  return range(64).flatMap((measure) => {
    const durations =
      measure % 2 === 0 ? [0.5, 0.5, 1, 0.5, 0.5, 1] : Array(16).fill(0.25);
    let start = measure * 4;
    return durations.map((duration, index) => {
      const note = createNote({
        pitch: SAMPLE_PITCHES[(measure + index) % SAMPLE_PITCHES.length],
        start,
        duration,
      });
      start += duration;
      return note;
    });
  });
}

function createSample({
  name,
  description,
  notes,
  tempo,
  locators = [],
  keySignature = { fifths: 0, mode: "major" },
}: ScoreViewerSampleDefinition): ScoreViewerSample {
  return {
    name,
    description,
    tempo,
    xml: exportMusicXml({
      keySignature,
      notes,
      tempo,
      title: name,
      locators,
      openStringPitches: TAB_STRING_PRESETS[0].openStringPitches,
      timeSignature: { numerator: 4, denominator: 4 },
    }),
  };
}

function createLocator(locator: Omit<Locator, "id">): Locator {
  return { ...locator, id: crypto.randomUUID() };
}

function createNote(note: Omit<Note, "id" | "velocity">): Note {
  return { ...note, id: crypto.randomUUID(), velocity: 100 };
}
