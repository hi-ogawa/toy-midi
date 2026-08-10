import { describe, expect, it } from "vitest";
import type { Note } from "../../types";
import { TAB_STRING_PRESETS } from "../tab-annotation";
import { exportMusicXml, type MusicXmlExportOptions } from "./render";

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
    locators: [],
    tempo: 120,
    title: "Test Score",
    keySignature: { fifths: 0, mode: "major" },
    timeSignature: { numerator: 4, denominator: 4 },
    openStringPitches: FIVE_STRING_PITCHES,
    ...options,
  });
}

describe("MusicXML export", () => {
  it("exports synchronized standard and five-string TAB staves", async () => {
    const xml = exportNotes([makeNote()], { title: "Rock & Roll <Bass>" });

    await expect(xml).toMatchFileSnapshot(
      "__snapshots__/five-string-tab.musicxml",
    );
  });

  it("renders tuplet boundaries for notes and rests on both staves", () => {
    const xml = exportNotes([
      makeNote({ id: "first", start: 0, duration: 1 / 3 }),
      makeNote({ id: "middle", start: 1 / 3, duration: 1 / 3 }),
      makeNote({ id: "last", start: 2 / 3, duration: 1 / 3 }),
    ]);

    expect(xml.match(/<tuplet type="start" number="1"\/>/g)).toHaveLength(2);
    expect(xml.match(/<tuplet type="stop" number="1"\/>/g)).toHaveLength(2);
    expect(xml).toContain('<tuplet type="start" number="1"/>');
  });
});
