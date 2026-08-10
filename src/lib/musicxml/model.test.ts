import { describe, expect, it } from "vitest";
import type { Note } from "../../types";
import { TAB_STRING_PRESETS } from "../tab-annotation";
import { buildMusicXmlModel, type MusicXmlModelOptions } from "./model";
import { MUSICXML_DIVISIONS } from "./split-notation";

const FOUR_STRING_PITCHES = TAB_STRING_PRESETS[0].openStringPitches;
const FIVE_STRING_PITCHES = TAB_STRING_PRESETS[1].openStringPitches;
const QUARTER_NOTE_DURATION = MUSICXML_DIVISIONS;

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

function buildModel(
  notes: Note[],
  options: Partial<MusicXmlModelOptions> = {},
) {
  return buildMusicXmlModel({
    notes,
    locators: [],
    timeSignature: { numerator: 4, denominator: 4 },
    keySignature: { fifths: 0, mode: "major" },
    openStringPitches: FIVE_STRING_PITCHES,
    ...options,
  });
}

describe("MusicXML model", () => {
  it("preserves an explicit TAB string assignment", () => {
    const model = buildModel([makeNote({ tabString: 4 })]);

    expect(model.measures[0].events[0]).toMatchObject({
      type: "note",
      tabPosition: { tabString: 4, fret: 5 },
    });
  });

  it("places rehearsal marks at measure boundaries and local offsets", () => {
    const model = buildModel([makeNote({ duration: 8 })], {
      locators: [
        { id: "section-a", position: 0, label: "A" },
        { id: "section-b", position: 6, label: "B" },
        { id: "section-c", position: 4, label: "C" },
      ],
    });

    expect(model.measures.map((measure) => measure.locators)).toEqual([
      [{ label: "A", offset: 0 }],
      [
        { label: "C", offset: 0 },
        { label: "B", offset: 2 * QUARTER_NOTE_DURATION },
      ],
    ]);
  });

  it("orders rehearsal marks while preserving duplicate positions", () => {
    const model = buildModel([makeNote({ duration: 4 })], {
      locators: [
        { id: "section-c", position: 3, label: "C" },
        { id: "section-a", position: 1, label: "A" },
        { id: "section-b", position: 1, label: "B" },
      ],
    });

    expect(model.measures[0].locators).toEqual([
      { label: "A", offset: QUARTER_NOTE_DURATION },
      { label: "B", offset: QUARTER_NOTE_DURATION },
      { label: "C", offset: 3 * QUARTER_NOTE_DURATION },
    ]);
  });

  it("ignores rehearsal marks after the final note", () => {
    const model = buildModel([makeNote()], {
      locators: [{ id: "section-b", position: 4, label: "B" }],
    });

    expect(model.measures.map((measure) => measure.locators)).toEqual([[]]);
  });

  it("shifts rehearsal marks with trimmed empty measures", () => {
    const model = buildModel([makeNote({ start: 12 })], {
      locators: [{ id: "section-a", position: 12, label: "A" }],
    });

    expect(model.measures[0].locators).toEqual([{ label: "A", offset: 0 }]);
  });

  it("rejects an off-grid rehearsal mark", () => {
    expect(() =>
      buildModel([makeNote()], {
        locators: [{ id: "section-a", position: 0.1, label: "A" }],
      }),
    ).toThrow("position of locator section-a is not aligned");
  });

  it("applies an embedded key directive and preserves its rehearsal label", () => {
    const notes = [
      // MIDI pitch 34 (A-sharp/B-flat 2)
      // bar 1 beat 4.5 ties into bar 2
      makeNote({ id: "tied", pitch: 34, start: 3.5, duration: 1 }),
      // bar 2 beat 2
      makeNote({ id: "after", pitch: 34, start: 5, duration: 1 }),
    ];
    const locators = [
      // bar 2 in G-flat
      {
        id: "last-chorus",
        position: 4,
        label: "Last chorus [!key: Gb major]",
      },
    ];
    const model = buildModel(notes, { locators });

    expect(model.measures[1]).toMatchObject({
      keySignature: { fifths: -6, mode: "major" },
      locators: [{ label: "Last chorus", offset: 0 }],
    });
    expect(
      model.measures.map((measure) =>
        measure.events
          .filter((event) => event.type === "note")
          .map((event) => event.pitch),
      ),
    ).toEqual([
      [
        // A# start in 1st bar in C major (non diatonic)
        { step: "A", alter: 1, octave: 2 },
      ],
      [
        // Tied note in 2nd bar is still spelled A# though already in Gb major
        { step: "A", alter: 1, octave: 2 },
        // New note at the same pitch is now spelled as Bb in Gb major (diatonic)
        { step: "B", alter: -1, octave: 2 },
      ],
    ]);
  });

  it("preserves a leading key directive measure", () => {
    const model = buildModel(
      [
        // Bb at bar 3
        makeNote({ pitch: 34, start: 12 }),
      ],
      {
        locators: [
          // bar 2
          { id: "earlier-key", position: 8, label: "[!key: E♭ major]" },
        ],
      },
    );

    expect(model.measures.length).toBe(2);
    expect(model.measures[0].keySignature).toEqual({
      fifths: -3,
      mode: "major",
    });
    expect(model.measures[0].locators).toEqual([]);
    expect(
      model.measures[1].events.find((event) => event.type === "note"),
    ).toMatchObject({
      type: "note",
      pitch: { step: "B", alter: -1, octave: 2 },
    });
  });

  it.each([
    {
      label: "[!key: F# major]",
      position: 0,
      error: "must be after beat 0",
    },
    {
      label: "[!key: F# major]",
      position: 2,
      error: "must be at the start of a measure",
    },
    {
      label: "[!tempo: 120]",
      position: 4,
      error: "Unknown score directive tempo",
    },
    {
      label: "[!key F# major]",
      position: 4,
      error: "Malformed score directive",
    },
    {
      label: "[!key: D# major]",
      position: 4,
      error: 'Unsupported key signature "D# major"',
    },
  ])("rejects invalid score directive $label", ({ label, position, error }) => {
    expect(() =>
      buildModel([makeNote({ duration: 8 })], {
        locators: [{ id: "invalid", position, label }],
      }),
    ).toThrow(error);
  });

  it("rejects multiple key directives at one measure", () => {
    expect(() =>
      buildModel([makeNote({ duration: 8 })], {
        locators: [
          { id: "first", position: 4, label: "[!key: F# major]" },
          { id: "second", position: 4, label: "[!key: Eb minor]" },
        ],
      }),
    ).toThrow("Multiple key signature locators are at the same measure");
  });

  it("splits notes at bar lines and ties the pieces", () => {
    const model = buildModel([makeNote({ start: 3.5, duration: 1 })]);

    expect(model.measureDuration).toBe(4 * QUARTER_NOTE_DURATION);
    expect(
      model.measures.map((events) =>
        events.events.filter((event) => event.type === "note"),
      ),
    ).toEqual([
      [
        {
          type: "note",
          pitch: { step: "A", alter: 0, octave: 2 },
          duration: QUARTER_NOTE_DURATION / 2,
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
          duration: QUARTER_NOTE_DURATION / 2,
          notation: { type: "eighth" },
          tabPosition: { tabString: 3, fret: 0 },
          tieStart: false,
          tieStop: true,
        },
      ],
    ]);
    expect(
      model.measures.map((events) =>
        events.events.reduce((total, event) => total + event.duration, 0),
      ),
    ).toEqual([4 * QUARTER_NOTE_DURATION, 4 * QUARTER_NOTE_DURATION]);
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

    expect(
      model.measures[0].events.filter((event) => event.type === "note"),
    ).toEqual([
      {
        type: "note",
        pitch: { step: "A", alter: 0, octave: 2 },
        duration: 1.5 * QUARTER_NOTE_DURATION,
        notation: { type: "quarter", dots: 1 },
        tabPosition: { tabString: 3, fret: 0 },
        tieStart: false,
        tieStop: false,
      },
      {
        type: "note",
        pitch: { step: "A", alter: 0, octave: 2 },
        duration: QUARTER_NOTE_DURATION / 3,
        notation: { type: "eighth", triplet: true },
        tabPosition: { tabString: 3, fret: 0 },
        tieStart: false,
        tieStop: false,
      },
    ]);
  });

  it.each([
    {
      start: 0,
      actual: [
        {
          type: "note",
          duration: 4,
          notation: { type: "eighth", triplet: true },
        },
        {
          type: "rest",
          duration: 8,
          notation: { type: "quarter", triplet: true },
        },
        { type: "rest", duration: 12, notation: { type: "quarter" } },
        { type: "rest", duration: 24, notation: { type: "half" } },
      ],
    },
    {
      start: 1,
      actual: [
        { type: "rest", duration: 12, notation: { type: "quarter" } },
        {
          type: "note",
          duration: 4,
          notation: { type: "eighth", triplet: true },
        },
        {
          type: "rest",
          duration: 8,
          notation: { type: "quarter", triplet: true },
        },
        { type: "rest", duration: 24, notation: { type: "half" } },
      ],
    },
    {
      start: 2,
      actual: [
        { type: "rest", duration: 24, notation: { type: "half" } },
        {
          type: "note",
          duration: 4,
          notation: { type: "eighth", triplet: true },
        },
        {
          type: "rest",
          duration: 8,
          notation: { type: "quarter", triplet: true },
        },
        { type: "rest", duration: 12, notation: { type: "quarter" } },
      ],
    },
    {
      start: 3,
      actual: [
        {
          type: "rest",
          duration: 36,
          notation: { type: "half", dots: 1 },
        },
        {
          type: "note",
          duration: 4,
          notation: { type: "eighth", triplet: true },
        },
        {
          type: "rest",
          duration: 8,
          notation: { type: "quarter", triplet: true },
        },
      ],
    },
  ])(
    "decomposes an eighth-note triplet at beat $start",
    ({ start, actual }) => {
      const model = buildModel([makeNote({ start, duration: 1 / 3 })]);

      expect(model.measures[0].events).toMatchObject(actual);
    },
  );

  it("groups complete beat-aligned triplet partitions", () => {
    const model = buildModel([
      makeNote({ id: "one-a", start: 0, duration: 1 / 3 }),
      makeNote({ id: "one-b", start: 1 / 3, duration: 1 / 3 }),
      makeNote({ id: "one-c", start: 2 / 3, duration: 1 / 3 }),
      makeNote({ id: "one-two-a", start: 1, duration: 1 / 3 }),
      makeNote({ id: "one-two-b", start: 4 / 3, duration: 2 / 3 }),
      makeNote({ id: "two-one-a", start: 2, duration: 2 / 3 }),
      makeNote({ id: "two-one-b", start: 8 / 3, duration: 1 / 3 }),
    ]);

    expect(
      model.measures[0].events.slice(0, 7).map((event) => ({
        duration: event.duration,
        boundary: event.notation.tupletBoundary,
      })),
    ).toEqual([
      { duration: 4, boundary: "start" },
      { duration: 4, boundary: undefined },
      { duration: 4, boundary: "stop" },
      { duration: 4, boundary: "start" },
      { duration: 8, boundary: "stop" },
      { duration: 8, boundary: "start" },
      { duration: 4, boundary: "stop" },
    ]);
  });

  it("groups generated triplet rests between notes without crossing the beat", () => {
    const model = buildModel([
      makeNote({ id: "first", start: 0, duration: 1 / 3 }),
      makeNote({ id: "last", start: 2 / 3, duration: 1 / 3 }),
    ]);

    expect(
      model.measures[0].events.slice(0, 3).map((event) => ({
        type: event.type,
        duration: event.duration,
        boundary: event.notation.tupletBoundary,
      })),
    ).toEqual([
      { type: "note", duration: 4, boundary: "start" },
      { type: "rest", duration: 4, boundary: undefined },
      { type: "note", duration: 4, boundary: "stop" },
    ]);
    expect(
      model.measures[0].events
        .slice(3)
        .every((event) => event.notation.tupletBoundary === undefined),
    ).toBe(true);
  });

  // 16th notes examples from the bass line in Billlie's "OFF AIR".
  // https://www.youtube.com/watch?v=knp40WxQgOI
  it("characterizes rests around a 16th pickup into beat 3", () => {
    const model = buildModel([
      makeNote({ id: "first", start: 0, duration: 0.5 }),
      makeNote({ id: "pickup", start: 1.75, duration: 0.25 }),
      makeNote({ id: "downbeat", start: 2, duration: 0.5 }),
    ]);

    // MuseScore splits the pre-pickup silence as [6, 6, 3], while [6, 9] is
    // also conventional. Future heuristic tuning may prefer either engraving.
    expect(
      model.measures[0].events.map(({ type, duration }) => [type, duration]),
    ).toEqual([
      ["note", 6],
      ["rest", 6],
      ["rest", 9],
      ["note", 3],
      ["note", 6],
      ["rest", 6],
      ["rest", 12],
    ]);
  });

  // Keep syncopated spans compact while exposing strong beat boundaries where
  // the onset or continuation makes them musically significant.
  it.each([
    { start: 0.25, duration: 0.75, actual: [9] },
    { start: 1.75, duration: 1.25, actual: [3, 12] },
    { start: 1.75, duration: 1.75, actual: [3, 18] },
    { start: 0, duration: 1.75, actual: [12, 9] },
    { start: 1.25, duration: 1.25, actual: [9, 6] },
  ])(
    "characterizes a syncopated $duration-beat note at beat $start",
    ({ start, duration, actual }) => {
      const model = buildModel([makeNote({ start, duration })]);
      const noteEvents = model.measures[0].events.filter(
        (event) => event.type === "note",
      );

      expect(noteEvents.map((event) => event.duration)).toEqual(actual);
      expect(
        noteEvents.map(({ tieStart, tieStop }) => ({ tieStart, tieStop })),
      ).toEqual(
        actual.map((_, index) => ({
          tieStart: index < actual.length - 1,
          tieStop: index > 0,
        })),
      );
    },
  );

  it.each([
    // Split around the beat boundary rather than hiding it with a dotted value.
    {
      start: 0.5,
      duration: 1,
      actual: [6, 6],
    },
    // Preserve the complete eighth note even though it begins on a subdivision.
    {
      start: 0.25,
      duration: 0.5,
      actual: [6],
    },
    // Preserve the strong midpoint of 4/4 rather than writing a half note
    // across it.
    {
      start: 1,
      duration: 2,
      actual: [12, 12],
    },
  ])(
    "decomposes a $duration-beat note after a rest at beat $start",
    ({ start, duration, actual }) => {
      const model = buildModel([makeNote({ start, duration })]);
      const noteEvents = model.measures[0].events
        .filter((event) => event.type === "note")
        .map((event) => event.duration);

      expect(noteEvents).toEqual(actual);
    },
  );

  it.each([
    { start: 0, durations: [8, 8, 8], actual: [8, 8, 8] },
    { start: 0, durations: [8, 16], actual: [8, 16] },
    { start: 0, durations: [16, 8], actual: [16, 8] },
    { start: 2, durations: [8, 8, 8], actual: [8, 8, 8] },
    { start: 2, durations: [8, 16], actual: [8, 16] },
    { start: 2, durations: [16, 8], actual: [16, 8] },
  ])(
    "decomposes quarter-note triplet $durations at beat $start",
    ({ start, durations, actual }) => {
      let position = start;
      const model = buildModel(
        durations.map((duration, index) => {
          const note = makeNote({
            id: `triplet-${index}`,
            start: position,
            duration: duration / QUARTER_NOTE_DURATION,
          });
          position += duration / QUARTER_NOTE_DURATION;
          return note;
        }),
      );

      const noteEvents = model.measures[0].events
        .filter((event) => event.type === "note")
        .map(({ duration }) => duration);

      expect(noteEvents).toEqual(actual);
    },
  );

  it("fills gaps and remaining measure time with rests", () => {
    const model = buildModel([
      makeNote({
        start: 1, // Beat 1
        duration: 1, // Quarter note
      }),
    ]);

    expect(model.measures[0].events).toEqual([
      {
        type: "rest",
        duration: QUARTER_NOTE_DURATION,
        notation: { type: "quarter" },
      },
      {
        type: "note",
        pitch: { step: "A", alter: 0, octave: 2 },
        duration: QUARTER_NOTE_DURATION,
        notation: { type: "quarter" },
        tabPosition: { tabString: 3, fret: 0 },
        tieStart: false,
        tieStop: false,
      },
      {
        type: "rest",
        duration: 2 * QUARTER_NOTE_DURATION,
        notation: { type: "half" },
      },
    ]);
  });

  it("removes complete empty measures before the first note", () => {
    const model = buildModel([
      makeNote({ id: "first", start: 12 }), // Bar 4, beat 1
      makeNote({ id: "later", start: 20 }), // Bar 6, beat 1
    ]);

    // The three-bar count-in disappears, so project bars 4 and 6 become score bars 1 and 3.
    expect(model.measures).toHaveLength(3);
    expect(model.measures[0].events[0]).toMatchObject({
      type: "note",
      duration: QUARTER_NOTE_DURATION,
    });
    expect(model.measures[2].events[0]).toMatchObject({
      type: "note",
      duration: QUARTER_NOTE_DURATION,
    });
  });

  it("preserves silence within the first retained measure", () => {
    const model = buildModel([makeNote({ start: 14 })]); // Bar 4, beat 3

    // Complete earlier bars disappear, but beats 1 and 2 remain as a half rest.
    expect(model.measures).toHaveLength(1);
    expect(model.measures[0].events).toEqual([
      {
        type: "rest",
        duration: 2 * QUARTER_NOTE_DURATION,
        notation: { type: "half" },
      },
      {
        type: "note",
        pitch: { step: "A", alter: 0, octave: 2 },
        duration: QUARTER_NOTE_DURATION,
        notation: { type: "quarter" },
        tabPosition: { tabString: 3, fret: 0 },
        tieStart: false,
        tieStop: false,
      },
      {
        type: "rest",
        duration: QUARTER_NOTE_DURATION,
        notation: { type: "quarter" },
      },
    ]);
  });

  it("uses the time signature to split measures", () => {
    const model = buildModel([makeNote({ start: 2.5, duration: 1 })], {
      timeSignature: { numerator: 6, denominator: 8 },
    });

    expect(model.measureDuration).toBe(3 * QUARTER_NOTE_DURATION);
    expect(model.measures).toHaveLength(2);
  });

  it("uses the time signature when trimming empty measures", () => {
    // In 6/8, each bar spans three quarter-note units, so this note is at bar 3, beat 5.
    const model = buildModel([makeNote({ start: 8 })], {
      timeSignature: { numerator: 6, denominator: 8 },
    });

    // Two complete bars disappear while the four eighth-note rest before the note remains.
    expect(model.measures).toHaveLength(1);
    expect(model.measures[0].events).toMatchObject([
      { type: "rest", duration: 2 * QUARTER_NOTE_DURATION },
      { type: "note", duration: QUARTER_NOTE_DURATION },
    ]);
  });

  it("resolves notes against four-string tuning", () => {
    const model = buildModel([makeNote()], {
      openStringPitches: FOUR_STRING_PITCHES,
    });

    expect(model.measures[0].events[0]).toMatchObject({
      type: "note",
      tabPosition: { tabString: 3, fret: 0 },
    });
  });

  it("resolves notes against custom open-string pitches", () => {
    const model = buildModel([makeNote()], {
      openStringPitches: [42, 37, 32, 27], // Gb2 Db2 Ab1 Eb1, down 1 semitone
    });

    expect(model.measures[0].events[0]).toMatchObject({
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
