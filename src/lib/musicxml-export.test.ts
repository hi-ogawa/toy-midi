import { describe, expect, it } from "vitest";
import type { Note } from "../types";
import {
  buildMusicXmlModel,
  exportMusicXml,
  type MusicXmlExportOptions,
  type MusicXmlModelOptions,
} from "./musicxml-export";
import { TAB_STRING_PRESETS } from "./tab-annotation";

const FOUR_STRING_PITCHES = TAB_STRING_PRESETS[0].openStringPitches;
const FIVE_STRING_PITCHES = TAB_STRING_PRESETS[1].openStringPitches;

function makeNote(options: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    pitch: 33, // A1, open A string
    start: 0, // Beat 0
    duration: 1, // Quarter note
    velocity: 100,
    ...options,
  };
}

function exportNotes(
  notes: Note[],
  options: Partial<MusicXmlExportOptions> = {},
): string {
  return exportMusicXml({
    notes,
    tempo: 120,
    keySignature: { fifths: 0, mode: "major" },
    timeSignature: { numerator: 4, denominator: 4 },
    openStringPitches: FIVE_STRING_PITCHES,
    ...options,
  });
}

function buildModel(
  notes: Note[],
  options: Partial<MusicXmlModelOptions> = {},
) {
  return buildMusicXmlModel({
    notes,
    timeSignature: { numerator: 4, denominator: 4 },
    keySignature: { fifths: 0, mode: "major" },
    openStringPitches: FIVE_STRING_PITCHES,
    ...options,
  });
}

describe("MusicXML export", () => {
  it("exports synchronized standard and five-string TAB staves", async () => {
    const xml = exportNotes([makeNote()]);

    await expect(xml).toMatchFileSnapshot(
      "__snapshots__/five-string-tab.musicxml",
    );
  });

  it("preserves an explicit TAB string assignment", () => {
    const model = buildModel([makeNote({ tabString: 4 })]);

    expect(model.measures[0][0]).toMatchObject({
      type: "note",
      tabPosition: { tabString: 4, fret: 5 },
    });
  });

  it("splits notes at bar lines and ties the pieces", () => {
    const model = buildModel([makeNote({ start: 3.5, duration: 1 })]);

    expect(model.measureDuration).toBe(48);
    expect(
      model.measures.map((events) =>
        events.filter((event) => event.type === "note"),
      ),
    ).toEqual([
      [
        {
          type: "note",
          pitch: { step: "A", alter: 0, octave: 2 },
          duration: 6,
          notation: { type: "eighth" },
          tabPosition: { tabString: 3, fret: 0 },
          tieStart: true,
          tieStop: false,
        },
      ],
      [
        {
          type: "note",
          pitch: { step: "A", alter: 0, octave: 2 },
          duration: 6,
          notation: { type: "eighth" },
          tabPosition: { tabString: 3, fret: 0 },
          tieStart: false,
          tieStop: true,
        },
      ],
    ]);
    expect(
      model.measures.map((events) =>
        events.reduce((total, event) => total + event.duration, 0),
      ),
    ).toEqual([48, 48]);
  });

  it("decomposes dotted and triplet durations", () => {
    const model = buildModel([
      makeNote({
        id: "dotted",
        start: 0,
        duration: 1.5, // Dotted quarter note
      }),
      makeNote({
        id: "triplet",
        start: 2,
        duration: 1 / 3, // Eighth-note triplet
      }),
    ]);

    expect(model.measures[0].filter((event) => event.type === "note")).toEqual([
      {
        type: "note",
        pitch: { step: "A", alter: 0, octave: 2 },
        duration: 18,
        notation: { type: "quarter", dots: 1 },
        tabPosition: { tabString: 3, fret: 0 },
        tieStart: false,
        tieStop: false,
      },
      {
        type: "note",
        pitch: { step: "A", alter: 0, octave: 2 },
        duration: 4,
        notation: { type: "eighth", triplet: true },
        tabPosition: { tabString: 3, fret: 0 },
        tieStart: false,
        tieStop: false,
      },
    ]);
  });

  it("fills gaps and remaining measure time with rests", () => {
    const model = buildModel([
      makeNote({
        start: 1, // Beat 1
        duration: 1, // Quarter note
      }),
    ]);

    expect(model.measures[0]).toEqual([
      {
        type: "rest",
        duration: 12,
        notation: { type: "quarter" },
      },
      {
        type: "note",
        pitch: { step: "A", alter: 0, octave: 2 },
        duration: 12,
        notation: { type: "quarter" },
        tabPosition: { tabString: 3, fret: 0 },
        tieStart: false,
        tieStop: false,
      },
      {
        type: "rest",
        duration: 24,
        notation: { type: "half" },
      },
    ]);
  });

  it("removes complete empty measures before the first note", () => {
    const model = buildModel([
      makeNote({ id: "first", start: 12 }), // Project bar 4, beat 1
      makeNote({ id: "later", start: 20 }), // Project bar 6, beat 1
    ]);

    // The three-bar count-in disappears, so project bars 4 and 6 become score bars 1 and 3.
    expect(model.measures).toHaveLength(3);
    expect(model.measures[0][0]).toMatchObject({
      type: "note",
      duration: 12,
    });
    expect(model.measures[2][0]).toMatchObject({
      type: "note",
      duration: 12,
    });
  });

  it("preserves silence within the first retained measure", () => {
    const model = buildModel([makeNote({ start: 14 })]); // Project bar 4, beat 3

    // Complete earlier bars disappear, but beats 1 and 2 remain as a half rest.
    expect(model.measures).toHaveLength(1);
    expect(model.measures[0]).toEqual([
      {
        type: "rest",
        duration: 24,
        notation: { type: "half" },
      },
      {
        type: "note",
        pitch: { step: "A", alter: 0, octave: 2 },
        duration: 12,
        notation: { type: "quarter" },
        tabPosition: { tabString: 3, fret: 0 },
        tieStart: false,
        tieStop: false,
      },
      {
        type: "rest",
        duration: 12,
        notation: { type: "quarter" },
      },
    ]);
  });

  it("uses the time signature to split measures", () => {
    const model = buildModel([makeNote({ start: 2.5, duration: 1 })], {
      timeSignature: { numerator: 6, denominator: 8 },
    });

    expect(model.measureDuration).toBe(36);
    expect(model.measures).toHaveLength(2);
  });

  it("uses the time signature when trimming empty measures", () => {
    // In 6/8, each bar spans three quarter-note units, so this note is at bar 3, beat 5.
    const model = buildModel([makeNote({ start: 8 })], {
      timeSignature: { numerator: 6, denominator: 8 },
    });

    // Two complete bars disappear while the four eighth-note rest before the note remains.
    expect(model.measures).toHaveLength(1);
    expect(model.measures[0]).toMatchObject([
      { type: "rest", duration: 24 },
      { type: "note", duration: 12 },
    ]);
  });

  it("resolves notes against four-string tuning", () => {
    const model = buildModel([makeNote()], {
      openStringPitches: FOUR_STRING_PITCHES,
    });

    expect(model.measures[0][0]).toMatchObject({
      type: "note",
      tabPosition: { tabString: 3, fret: 0 },
    });
  });

  it("resolves notes against custom open-string pitches", () => {
    const model = buildModel([makeNote()], {
      openStringPitches: [42, 37, 32, 27], // Gb2 Db2 Ab1 Eb1, down 1 semitone
    });

    expect(model.measures[0][0]).toMatchObject({
      type: "note",
      tabPosition: { tabString: 3, fret: 1 },
    });
  });

  it("rejects a polyphonic chord", () => {
    expect(() =>
      buildModel([
        makeNote({ id: "low-g", pitch: 31 }), // G1
        makeNote({ id: "high-b", pitch: 47 }), // B2, a third over G in the next octave
      ]),
    ).toThrow(
      "Polyphonic or overlapping notes low-g and high-b are not supported",
    );
  });

  it("rejects notes outside the selected bass range", () => {
    expect(() =>
      buildModel([makeNote({ pitch: 23 /* B0 */ })], {
        openStringPitches: FOUR_STRING_PITCHES,
      }),
    ).toThrow("MIDI note 23 is not playable on a 4-string bass");
  });

  it("rejects notes that are not aligned to a supported grid", () => {
    expect(() => buildModel([makeNote({ start: 0.1 })])).toThrow(
      "start of note note-1 is not aligned to a supported grid",
    );
  });
});
