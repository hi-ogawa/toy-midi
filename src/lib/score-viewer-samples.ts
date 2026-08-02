import { exportMusicXml } from "./musicxml-export";

export type ScoreViewerSample = {
  id: string;
  name: string;
  description: string;
  tempo: number;
  xml: string;
};

const OPEN_STRINGS = [43, 38, 33, 28] as const;
const SAMPLE_PITCHES = [40, 43, 45, 47, 48, 47, 45, 43];

export const SCORE_VIEWER_SAMPLES: ScoreViewerSample[] = [
  createSample({
    id: "cursor-wrapping",
    name: "Cursor and wrapping",
    description: "64 eighth notes at 60 BPM",
    tempo: 60,
    notes: Array.from({ length: 64 }, (_, index) => [
      index * 0.5,
      0.5,
      SAMPLE_PITCHES[index % SAMPLE_PITCHES.length],
    ]),
  }),
  createSample({
    id: "rhythm-rests",
    name: "Rhythm and rests",
    description: "Mixed durations, gaps, and a full-measure rest",
    tempo: 90,
    notes: [
      [0, 1, 40],
      [1, 0.5, 43],
      [1.5, 0.25, 45],
      [1.75, 0.25, 47],
      [2.5, 1.5, 48],
      [8, 0.75, 47],
      [8.75, 0.25, 45],
      [9.5, 0.5, 43],
      [10.5, 1.5, 40],
    ],
  }),
  createSample({
    id: "ties-barlines",
    name: "Ties and barlines",
    description: "Durations split within and across measures",
    tempo: 80,
    notes: [
      [0, 2.5, 40],
      [2.5, 2.5, 43],
      [5, 2.5, 45],
      [7.5, 2.5, 47],
      [10, 2, 48],
    ],
  }),
  {
    id: "tab-positions",
    name: "TAB positions",
    description: "Open strings and explicit alternate-string frets",
    tempo: 70,
    xml: exportMusicXml({
      notes: [
        { id: "tab-0", pitch: 40, start: 0, duration: 1, velocity: 100 },
        { id: "tab-1", pitch: 45, start: 1, duration: 1, velocity: 100 },
        {
          id: "tab-2",
          pitch: 45,
          start: 2,
          duration: 1,
          velocity: 100,
          tabString: 3,
        },
        {
          id: "tab-3",
          pitch: 40,
          start: 3,
          duration: 1,
          velocity: 100,
          tabString: 4,
        },
        { id: "tab-4", pitch: 28, start: 4, duration: 1, velocity: 100 },
        { id: "tab-5", pitch: 33, start: 5, duration: 1, velocity: 100 },
        { id: "tab-6", pitch: 38, start: 6, duration: 1, velocity: 100 },
        { id: "tab-7", pitch: 43, start: 7, duration: 1, velocity: 100 },
      ],
      openStringPitches: OPEN_STRINGS,
      tempo: 70,
      timeSignature: { numerator: 4, denominator: 4 },
    }),
  },
  createSample({
    id: "dense-sixteenths",
    name: "Dense sixteenths",
    description: "16th-note funk density at 110 BPM",
    tempo: 110,
    notes: Array.from({ length: 96 }, (_, index) => [
      index * 0.25,
      0.25,
      SAMPLE_PITCHES[index % SAMPLE_PITCHES.length],
    ]),
  }),
  createSample({
    id: "fast-eighths",
    name: "Fast eighths",
    description: "Fast cursor and following at 200 BPM",
    tempo: 200,
    notes: Array.from({ length: 96 }, (_, index) => [
      index * 0.5,
      0.5,
      SAMPLE_PITCHES[index % SAMPLE_PITCHES.length],
    ]),
  }),
];

function createSample({
  id,
  name,
  description,
  tempo,
  notes,
}: {
  id: string;
  name: string;
  description: string;
  tempo: number;
  notes: number[][];
}): ScoreViewerSample {
  return {
    id,
    name,
    description,
    tempo,
    xml: exportMusicXml({
      notes: notes.map(([start, duration, pitch], index) => ({
        id: `${id}-${index}`,
        pitch,
        start,
        duration,
        velocity: 100,
      })),
      openStringPitches: OPEN_STRINGS,
      tempo,
      timeSignature: { numerator: 4, denominator: 4 },
    }),
  };
}
