import type { Note } from "../types";
import { exportMusicXml } from "./musicxml-export";
import { TAB_STRING_PRESETS } from "./tab-annotation";

export type ScoreViewerSample = {
  id: string;
  name: string;
  description: string;
  tempo: number;
  xml: string;
};

const SAMPLE_PITCHES = [40, 43, 45, 47, 48, 47, 45, 43];

export const SCORE_VIEWER_SAMPLES: ScoreViewerSample[] = [
  {
    id: "cursor-wrapping",
    name: "Cursor and wrapping",
    description: "64 eighth notes at 60 BPM",
    tempo: 60,
    xml: exportSample({
      notes: Array.from({ length: 64 }, (_, index) =>
        createNote({
          pitch: SAMPLE_PITCHES[index % SAMPLE_PITCHES.length],
          start: index * 0.5,
          duration: 0.5,
        }),
      ),
      tempo: 60,
    }),
  },
  {
    id: "rhythm-rests",
    name: "Rhythm and rests",
    description: "Mixed durations, gaps, and a full-measure rest",
    tempo: 90,
    xml: exportSample({
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
      tempo: 90,
    }),
  },
  {
    id: "ties-barlines",
    name: "Ties and barlines",
    description: "Durations split within and across measures",
    tempo: 80,
    xml: exportSample({
      notes: [
        createNote({ pitch: 40, start: 0, duration: 2.5 }),
        createNote({ pitch: 43, start: 2.5, duration: 2.5 }),
        createNote({ pitch: 45, start: 5, duration: 2.5 }),
        createNote({ pitch: 47, start: 7.5, duration: 2.5 }),
        createNote({ pitch: 48, start: 10, duration: 2 }),
      ],
      tempo: 80,
    }),
  },
  {
    id: "tab-positions",
    name: "TAB positions",
    description: "Open strings and explicit alternate-string frets",
    tempo: 70,
    xml: exportSample({
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
      tempo: 70,
    }),
  },
  {
    id: "dense-sixteenths",
    name: "Dense sixteenths",
    description: "16th-note funk density at 110 BPM",
    tempo: 110,
    xml: exportSample({
      notes: Array.from({ length: 96 }, (_, index) =>
        createNote({
          pitch: SAMPLE_PITCHES[index % SAMPLE_PITCHES.length],
          start: index * 0.25,
          duration: 0.25,
        }),
      ),
      tempo: 110,
    }),
  },
  {
    id: "fast-eighths",
    name: "Fast eighths",
    description: "Fast cursor and following at 200 BPM",
    tempo: 200,
    xml: exportSample({
      notes: Array.from({ length: 96 }, (_, index) =>
        createNote({
          pitch: SAMPLE_PITCHES[index % SAMPLE_PITCHES.length],
          start: index * 0.5,
          duration: 0.5,
        }),
      ),
      tempo: 200,
    }),
  },
];

function exportSample({ notes, tempo }: { notes: Note[]; tempo: number }) {
  return exportMusicXml({
    notes,
    tempo,
    openStringPitches: TAB_STRING_PRESETS[0].openStringPitches,
    timeSignature: { numerator: 4, denominator: 4 },
  });
}

function createNote(note: Omit<Note, "id" | "velocity">): Note {
  return { ...note, id: crypto.randomUUID(), velocity: 100 };
}
