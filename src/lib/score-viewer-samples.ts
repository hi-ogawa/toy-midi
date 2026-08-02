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
    xml: exportMusicXml({
      notes: Array.from({ length: 64 }, (_, index) => ({
        id: `cursor-wrapping-${index}`,
        pitch: SAMPLE_PITCHES[index % SAMPLE_PITCHES.length],
        start: index * 0.5,
        duration: 0.5,
        velocity: 100,
      })),
      openStringPitches: TAB_STRING_PRESETS[0].openStringPitches,
      tempo: 60,
      timeSignature: { numerator: 4, denominator: 4 },
    }),
  },
  {
    id: "rhythm-rests",
    name: "Rhythm and rests",
    description: "Mixed durations, gaps, and a full-measure rest",
    tempo: 90,
    xml: exportMusicXml({
      notes: [
        { id: "rhythm-0", pitch: 40, start: 0, duration: 1, velocity: 100 },
        { id: "rhythm-1", pitch: 43, start: 1, duration: 0.5, velocity: 100 },
        {
          id: "rhythm-2",
          pitch: 45,
          start: 1.5,
          duration: 0.25,
          velocity: 100,
        },
        {
          id: "rhythm-3",
          pitch: 47,
          start: 1.75,
          duration: 0.25,
          velocity: 100,
        },
        { id: "rhythm-4", pitch: 48, start: 2.5, duration: 1.5, velocity: 100 },
        { id: "rhythm-5", pitch: 47, start: 8, duration: 0.75, velocity: 100 },
        {
          id: "rhythm-6",
          pitch: 45,
          start: 8.75,
          duration: 0.25,
          velocity: 100,
        },
        { id: "rhythm-7", pitch: 43, start: 9.5, duration: 0.5, velocity: 100 },
        {
          id: "rhythm-8",
          pitch: 40,
          start: 10.5,
          duration: 1.5,
          velocity: 100,
        },
      ],
      openStringPitches: TAB_STRING_PRESETS[0].openStringPitches,
      tempo: 90,
      timeSignature: { numerator: 4, denominator: 4 },
    }),
  },
  {
    id: "ties-barlines",
    name: "Ties and barlines",
    description: "Durations split within and across measures",
    tempo: 80,
    xml: exportMusicXml({
      notes: [
        { id: "tie-0", pitch: 40, start: 0, duration: 2.5, velocity: 100 },
        { id: "tie-1", pitch: 43, start: 2.5, duration: 2.5, velocity: 100 },
        { id: "tie-2", pitch: 45, start: 5, duration: 2.5, velocity: 100 },
        { id: "tie-3", pitch: 47, start: 7.5, duration: 2.5, velocity: 100 },
        { id: "tie-4", pitch: 48, start: 10, duration: 2, velocity: 100 },
      ],
      openStringPitches: TAB_STRING_PRESETS[0].openStringPitches,
      tempo: 80,
      timeSignature: { numerator: 4, denominator: 4 },
    }),
  },
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
      openStringPitches: TAB_STRING_PRESETS[0].openStringPitches,
      tempo: 70,
      timeSignature: { numerator: 4, denominator: 4 },
    }),
  },
  {
    id: "dense-sixteenths",
    name: "Dense sixteenths",
    description: "16th-note funk density at 110 BPM",
    tempo: 110,
    xml: exportMusicXml({
      notes: Array.from({ length: 96 }, (_, index) => ({
        id: `dense-sixteenths-${index}`,
        pitch: SAMPLE_PITCHES[index % SAMPLE_PITCHES.length],
        start: index * 0.25,
        duration: 0.25,
        velocity: 100,
      })),
      openStringPitches: TAB_STRING_PRESETS[0].openStringPitches,
      tempo: 110,
      timeSignature: { numerator: 4, denominator: 4 },
    }),
  },
  {
    id: "fast-eighths",
    name: "Fast eighths",
    description: "Fast cursor and following at 200 BPM",
    tempo: 200,
    xml: exportMusicXml({
      notes: Array.from({ length: 96 }, (_, index) => ({
        id: `fast-eighths-${index}`,
        pitch: SAMPLE_PITCHES[index % SAMPLE_PITCHES.length],
        start: index * 0.5,
        duration: 0.5,
        velocity: 100,
      })),
      openStringPitches: TAB_STRING_PRESETS[0].openStringPitches,
      tempo: 200,
      timeSignature: { numerator: 4, denominator: 4 },
    }),
  },
];
