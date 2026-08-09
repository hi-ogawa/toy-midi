import { range } from "../../utils/array";
import {
  type KeySignature,
  type SpelledPitch,
  spellChromaticPitch,
} from "../pitch-spelling";
import {
  buildMusicXmlModel,
  type MusicXmlMeasure,
  type MusicXmlModelOptions,
} from "./model";
import type { DurationNotation, MusicXmlMeasureEvent } from "./split-notation";
import { MUSICXML_DIVISIONS } from "./split-notation";
import { h, hx, renderXml, type XmlElement, type XmlNode } from "./vdom";

// Maps the score model to the MusicXML document structure; musical decisions belong in model.ts.

export type MusicXmlExportOptions = MusicXmlModelOptions & {
  tempo: number;
  title: string;
};

// This format was manually reduced from a MuseScore MusicXML export and
// iterated through MuseScore import/export in PR #212. In particular, the two
// explicit staves and the <backup> between their duplicated note streams are
// required for standard notation and TAB to import together while preserving
// explicit string/fret assignments.
export function exportMusicXml({
  notes,
  tempo,
  title,
  timeSignature,
  keySignature,
  openStringPitches,
  locators,
}: MusicXmlExportOptions): string {
  const { measureDuration, measures } = buildMusicXmlModel({
    notes,
    timeSignature,
    keySignature,
    openStringPitches,
    locators,
  });
  // MusicXML places score-level configuration inside the first measure.
  const initialMeasureChildren = [
    hx(
      "attributes",
      hx("divisions", MUSICXML_DIVISIONS),
      hx(
        "time",
        hx("beats", timeSignature.numerator),
        hx("beat-type", timeSignature.denominator),
      ),
      hx("staves", 2),
      h("clef", { number: 1 }, hx("sign", "F"), hx("line", 4)),
      h("clef", { number: 2 }, hx("sign", "TAB")),
      renderStaffDetails(openStringPitches),
      // Bass sounds one octave below its written pitch, so MuseScore transposes
      // playback while retaining conventional bass notation.
      hx(
        "transpose",
        hx("diatonic", 0),
        hx("chromatic", 0),
        hx("octave-change", -1),
      ),
    ),
    h(
      "direction",
      { placement: "above" },
      hx(
        "direction-type",
        h(
          "metronome",
          { parentheses: "no" },
          hx("beat-unit", "quarter"),
          hx("per-minute", tempo),
        ),
      ),
      hx("staff", 1),
      h("sound", { tempo }),
    ),
  ];

  const document = h(
    "score-partwise",
    { version: "4.0" },
    hx("work", hx("work-title", title)),
    // TODO: Populate part and MIDI instrument metadata from Toy MIDI instrument
    // data instead of hard-coding Electric Bass when non-bass export is supported.
    hx(
      "part-list",
      h(
        "score-part",
        { id: "P1" },
        h(
          "score-instrument",
          { id: "P1-I1" },
          hx("instrument-name", "Electric Bass"),
          hx("instrument-sound", "pluck.bass.electric"),
        ),
        h(
          "midi-instrument",
          { id: "P1-I1" },
          hx("midi-channel", 1),
          hx("midi-program", 34),
        ),
      ),
    ),
    h(
      "part",
      { id: "P1" },
      ...measures.map((measure, index) =>
        renderMeasure({
          measure,
          index,
          measureDuration,
          initialChildren: index === 0 ? initialMeasureChildren : [],
        }),
      ),
    ),
  );

  return `\
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
${renderXml(document)}
`;
}

function renderMeasure({
  measure,
  index,
  measureDuration,
  initialChildren,
}: {
  measure: MusicXmlMeasure;
  index: number;
  measureDuration: number;
  initialChildren: XmlNode[];
}): XmlElement {
  // Rewind the measure cursor so staff 2 runs in parallel with staff 1.
  return h(
    "measure",
    { number: index + 1 },
    ...initialChildren,
    measure.keySignature &&
      hx("attributes", renderKeySignature(measure.keySignature)),
    ...measure.locators.map(renderRehearsalDirection),
    ...measure.events.map((event) => renderEvent(event, 1)),
    hx("backup", hx("duration", measureDuration)),
    ...measure.events.map((event) => renderEvent(event, 2)),
  );
}

function renderKeySignature(keySignature: KeySignature): XmlElement {
  return hx(
    "key",
    hx("fifths", keySignature.fifths),
    hx("mode", keySignature.mode),
  );
}

function renderRehearsalDirection({
  label,
  offset,
}: {
  label: string;
  offset: number;
}): XmlElement {
  return h(
    "direction",
    { placement: "above" },
    hx("direction-type", hx("rehearsal", label)),
    offset > 0 && hx("offset", offset),
    hx("staff", 1),
  );
}

function renderStaffDetails(openStringPitches: readonly number[]): XmlElement {
  // The app stores strings from highest to lowest pitch, while MusicXML numbers
  // TAB staff lines from the lowest line upward.
  const tuning = [...openStringPitches].reverse();
  return h(
    "staff-details",
    { number: 2 },
    hx("staff-lines", openStringPitches.length),
    ...tuning.map((midi, index) => {
      const pitch = toWrittenBassPitch(spellChromaticPitch(midi));
      return h(
        "staff-tuning",
        { line: index + 1 },
        hx("tuning-step", pitch.step),
        pitch.alter !== 0 && hx("tuning-alter", pitch.alter),
        hx("tuning-octave", pitch.octave),
      );
    }),
  );
}

function renderEvent(event: MusicXmlMeasureEvent, staff: 1 | 2): XmlElement {
  // MuseScore allocates four voice IDs per staff, so the first voices of staff 1
  // and staff 2 are 1 and 5 respectively.
  const voice = staff === 1 ? 1 : 5;
  if (event.type === "rest") {
    return hx(
      "note",
      hx("rest"),
      hx("duration", event.duration),
      hx("voice", voice),
      ...renderDurationNotation(event.notation),
      hx("staff", staff),
    );
  }

  // MusicXML uses <tie> for playback and <tied> for engraved notation, so each
  // model tie must be emitted in both forms.
  const tiedNotations = [
    event.tieStop && h("tied", { type: "stop" }),
    event.tieStart && h("tied", { type: "start" }),
  ];
  const technical =
    staff === 2 &&
    hx(
      "technical",
      hx("string", event.tabPosition.tabString),
      hx("fret", event.tabPosition.fret),
    );

  return hx(
    "note",
    hx(
      "pitch",
      hx("step", event.pitch.step),
      event.pitch.alter !== 0 && hx("alter", event.pitch.alter),
      hx("octave", event.pitch.octave),
    ),
    hx("duration", event.duration),
    event.tieStop && h("tie", { type: "stop" }),
    event.tieStart && h("tie", { type: "start" }),
    hx("voice", voice),
    ...renderDurationNotation(event.notation),
    hx("staff", staff),
    (tiedNotations.some(Boolean) || technical) &&
      hx("notations", ...tiedNotations, technical),
  );
}

function renderDurationNotation(notation: DurationNotation): XmlNode[] {
  return [
    hx("type", notation.type),
    ...range(notation.dots ?? 0).map(() => hx("dot")),
    notation.triplet &&
      hx("time-modification", hx("actual-notes", 3), hx("normal-notes", 2)),
  ];
}

function toWrittenBassPitch(pitch: SpelledPitch): SpelledPitch {
  // Bass notation is written one octave above sounding pitch; the matching
  // MusicXML <transpose> metadata shifts playback back down an octave.
  return { ...pitch, octave: pitch.octave + 1 };
}
