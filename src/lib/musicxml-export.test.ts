import { describe, expect, it } from "vitest";
import type { Note } from "../types";
import { exportMusicXml } from "./musicxml-export";
import { TAB_OPEN_STRING_PRESETS } from "./tab-annotation";

function makeNote(options: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    pitch: 33,
    start: 0,
    duration: 1,
    velocity: 100,
    ...options,
  };
}

function exportNotes(
  notes: Note[],
  options: Partial<Parameters<typeof exportMusicXml>[0]> = {},
): string {
  return exportMusicXml({
    notes,
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    name: "Test & Song",
    openStringPitches: TAB_OPEN_STRING_PRESETS.fiveString,
    ...options,
  });
}

describe("MusicXML export", () => {
  it("exports synchronized standard and five-string TAB staves", () => {
    const xml = exportNotes([makeNote({ tabString: 4 })]);

    expect(xml).toContain("<work-title>Test &amp; Song</work-title>");
    expect(xml).toContain("<staves>2</staves>");
    expect(xml).toContain('<clef number="1">\n          <sign>F</sign>');
    expect(xml).toContain('<clef number="2">\n          <sign>TAB</sign>');
    expect(xml).toContain("<staff-lines>5</staff-lines>");
    expect(xml).toContain(
      "<tuning-step>B</tuning-step>\n            <tuning-octave>1</tuning-octave>",
    );
    expect(xml).toContain("<octave>2</octave>");
    expect(xml).toContain("<string>4</string>\n            <fret>5</fret>");
    expect(xml.match(/<step>A<\/step>/g)).toHaveLength(2);
    expect(xml).toContain("<backup>\n        <duration>48</duration>");
    expect(xml).toContain("<per-minute>120</per-minute>");
  });

  it("splits notes at bar lines and ties both staves", () => {
    const xml = exportNotes([makeNote({ start: 3.5, duration: 1 })]);

    expect(xml.match(/<measure number=/g)).toHaveLength(2);
    expect(xml.match(/<tie type="start"\/>/g)).toHaveLength(2);
    expect(xml.match(/<tie type="stop"\/>/g)).toHaveLength(2);
    expect(xml.match(/<tied type="start"\/>/g)).toHaveLength(2);
    expect(xml.match(/<tied type="stop"\/>/g)).toHaveLength(2);
    expect(xml.match(/<rest\/>/g)?.length).toBeGreaterThan(0);
  });

  it("writes dotted and triplet durations", () => {
    const xml = exportNotes([
      makeNote({ id: "dotted", duration: 1.5 }),
      makeNote({
        id: "triplet",
        start: 2,
        duration: 1 / 3,
        pitch: 35,
      }),
    ]);

    expect(xml.match(/<dot\/>/g)).toHaveLength(2);
    expect(
      xml.match(/<duration>4<\/duration>/g)?.length,
    ).toBeGreaterThanOrEqual(2);
    expect(xml.match(/<time-modification>/g)?.length).toBeGreaterThanOrEqual(2);
    expect(xml).toContain("<actual-notes>3</actual-notes>");
  });

  it("uses the time signature to split measures", () => {
    const xml = exportNotes([makeNote({ start: 2.5, duration: 1 })], {
      timeSignature: { numerator: 6, denominator: 8 },
    });

    expect(xml.match(/<measure number=/g)).toHaveLength(2);
    expect(
      xml.match(/<backup>\n        <duration>36<\/duration>/g),
    ).toHaveLength(2);
    expect(xml).toContain("<beats>6</beats>");
    expect(xml).toContain("<beat-type>8</beat-type>");
  });

  it("exports four-string tuning", () => {
    const xml = exportNotes([makeNote()], {
      openStringPitches: TAB_OPEN_STRING_PRESETS.fourString,
    });

    expect(xml).toContain("<staff-lines>4</staff-lines>");
    expect(xml).not.toContain("<tuning-step>B</tuning-step>");
    expect(xml).toContain(
      "<tuning-step>E</tuning-step>\n            <tuning-octave>2</tuning-octave>",
    );
  });

  it("derives MusicXML tuning from custom open-string pitches", () => {
    const xml = exportNotes([makeNote()], {
      openStringPitches: [42, 38, 33, 28],
    });

    expect(xml).toContain(
      '<staff-tuning line="1">\n            <tuning-step>E</tuning-step>\n            <tuning-octave>2</tuning-octave>',
    );
    expect(xml).toContain(
      '<staff-tuning line="4">\n            <tuning-step>F</tuning-step>\n            <tuning-alter>1</tuning-alter>\n            <tuning-octave>3</tuning-octave>',
    );
  });

  it("spells chromatic pitches with sharps in the C-major placeholder key", () => {
    const xml = exportNotes([makeNote({ pitch: 34 })]);

    expect(xml).toContain(
      "<step>A</step>\n          <alter>1</alter>\n          <octave>2</octave>",
    );
    expect(xml).toContain("<fifths>0</fifths>");
  });

  it("rejects overlapping notes", () => {
    expect(() =>
      exportNotes([
        makeNote({ id: "first", duration: 2 }),
        makeNote({ id: "second", start: 1 }),
      ]),
    ).toThrow("Overlapping notes first and second are not supported");
  });

  it("rejects notes outside the selected bass range", () => {
    expect(() =>
      exportNotes([makeNote({ pitch: 23 })], {
        openStringPitches: TAB_OPEN_STRING_PRESETS.fourString,
      }),
    ).toThrow("MIDI note 23 is not playable on a 4-string bass");
  });

  it("rejects notes that are not aligned to a supported grid", () => {
    expect(() => exportNotes([makeNote({ start: 0.1 })])).toThrow(
      "start of note note-1 is not aligned to a supported grid",
    );
  });
});
