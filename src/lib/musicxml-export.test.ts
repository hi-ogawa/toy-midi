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
    start: 0,
    duration: 1,
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
    timeSignature: { numerator: 4, denominator: 4 },
    name: "Test & Song",
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
    openStringPitches: FIVE_STRING_PITCHES,
    ...options,
  });
}

describe("MusicXML export", () => {
  it("exports synchronized standard and five-string TAB staves", async () => {
    const xml = exportNotes([makeNote({ tabString: 4 })]);

    await expect(xml).toMatchFileSnapshot(
      "__snapshots__/five-string-tab.musicxml",
    );
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
          pitch: 33,
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
          pitch: 33,
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
      makeNote({ id: "dotted", pitch: 33, duration: 1.5 }), // A1
      makeNote({
        id: "triplet",
        start: 2,
        duration: 1 / 3,
        pitch: 35, // B1
      }),
    ]);

    expect(model.measures[0].filter((event) => event.type === "note")).toEqual([
      {
        type: "note",
        pitch: 33,
        duration: 18,
        notation: { type: "quarter", dots: 1 },
        tabPosition: { tabString: 3, fret: 0 },
        tieStart: false,
        tieStop: false,
      },
      {
        type: "note",
        pitch: 35,
        duration: 4,
        notation: { type: "eighth", triplet: true },
        tabPosition: { tabString: 3, fret: 2 },
        tieStart: false,
        tieStop: false,
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
      openStringPitches: [42, 38, 33, 28], // F#2 D2 A1 E1
    });

    expect(model.measures[0][0]).toMatchObject({
      type: "note",
      tabPosition: { tabString: 3, fret: 0 },
    });
  });

  it("rejects overlapping notes", () => {
    expect(() =>
      buildModel([
        makeNote({ id: "first", duration: 2 }),
        makeNote({ id: "second", start: 1 }),
      ]),
    ).toThrow("Overlapping notes first and second are not supported");
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
