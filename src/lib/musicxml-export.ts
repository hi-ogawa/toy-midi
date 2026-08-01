import type { Note, TimeSignature } from "../types";
import { downloadBlob } from "./export-utils";
import { resolveTabPosition, type TabPosition } from "./tab-annotation";

// This format was manually reduced from a MuseScore MusicXML export and
// iterated through MuseScore import/export in PR #212. In particular, the two
// explicit staves and the <backup> between their duplicated note streams are
// required for standard notation and TAB to import together while preserving
// explicit string/fret assignments.

const DIVISIONS = 12;
const EPSILON = 1e-6;

type MusicXmlExportOptions = {
  notes: Note[];
  tempo: number;
  timeSignature: TimeSignature;
  name: string;
  openStringPitches: readonly number[];
};

type QuantizedNote = {
  note: Note;
  start: number;
  end: number;
  tabPosition: TabPosition;
};

type MeasureEvent =
  | { type: "rest"; duration: number; notation: DurationNotation }
  | {
      type: "note";
      pitch: number;
      duration: number;
      notation: DurationNotation;
      tabPosition: TabPosition;
      tieStart: boolean;
      tieStop: boolean;
    };

type DurationNotation = {
  type: string;
  dots?: number;
  triplet?: boolean;
};

type DurationCandidate = DurationNotation & {
  duration: number;
  alignment: number;
};

const DURATION_CANDIDATES: DurationCandidate[] = [
  { duration: 48, alignment: 48, type: "whole" },
  { duration: 36, alignment: 24, type: "half", dots: 1 },
  { duration: 32, alignment: 32, type: "whole", triplet: true },
  { duration: 24, alignment: 24, type: "half" },
  { duration: 18, alignment: 12, type: "quarter", dots: 1 },
  { duration: 16, alignment: 16, type: "half", triplet: true },
  { duration: 12, alignment: 12, type: "quarter" },
  { duration: 9, alignment: 6, type: "eighth", dots: 1 },
  { duration: 8, alignment: 8, type: "quarter", triplet: true },
  { duration: 6, alignment: 6, type: "eighth" },
  { duration: 4, alignment: 4, type: "eighth", triplet: true },
  { duration: 3, alignment: 3, type: "16th" },
  { duration: 2, alignment: 2, type: "16th", triplet: true },
  { duration: 1, alignment: 1, type: "32nd", triplet: true },
];

export function exportMusicXml({
  notes,
  tempo,
  timeSignature,
  name,
  openStringPitches,
}: MusicXmlExportOptions): string {
  if (notes.length === 0) {
    throw new Error("Add at least one note before exporting MusicXML");
  }

  validateOpenStringPitches(openStringPitches);
  const measureDuration = toGridUnits(
    timeSignature.numerator * (4 / timeSignature.denominator),
    "time signature",
  );
  const quantizedNotes = prepareNotes({ notes, openStringPitches });
  const measureCount = Math.ceil(
    quantizedNotes[quantizedNotes.length - 1].end / measureDuration,
  );
  const measures = Array.from({ length: measureCount }, (_, index) =>
    buildMeasureEvents({
      notes: quantizedNotes,
      measureStart: index * measureDuration,
      measureDuration,
    }),
  );

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>${escapeXml(name)}</work-title>
  </work>
  <part-list>
    <score-part id="P1">
      <part-name>${openStringPitches.length}-string Bass</part-name>
      <score-instrument id="P1-I1">
        <instrument-name>${openStringPitches.length}-string Electric Bass</instrument-name>
        <instrument-sound>pluck.bass.electric</instrument-sound>
      </score-instrument>
      <midi-instrument id="P1-I1">
        <midi-channel>1</midi-channel>
        <midi-program>34</midi-program>
      </midi-instrument>
    </score-part>
  </part-list>
  <part id="P1">
${measures
  .map((events, index) =>
    renderMeasure({
      events,
      index,
      measureDuration,
      tempo,
      timeSignature,
      openStringPitches,
    }),
  )
  .join("\n")}
  </part>
</score-partwise>
`;
}

export function downloadMusicXmlFile(xml: string, fileName: string): void {
  const blob = new Blob([xml], {
    type: "application/vnd.recordare.musicxml+xml",
  });
  downloadBlob(blob, fileName);
}

function prepareNotes({
  notes,
  openStringPitches,
}: {
  notes: Note[];
  openStringPitches: readonly number[];
}): QuantizedNote[] {
  const result = notes
    .map((note) => {
      const start = toGridUnits(note.start, `start of note ${note.id}`);
      const duration = toGridUnits(
        note.duration,
        `duration of note ${note.id}`,
      );
      if (start < 0) {
        throw new Error(`Note ${note.id} starts before beat 0`);
      }
      if (duration <= 0) {
        throw new Error(`Note ${note.id} must have a positive duration`);
      }
      const tabPosition = resolveTabPosition({
        pitch: note.pitch,
        openStringPitches,
        tabString: note.tabString,
      });
      if (!tabPosition) {
        throw new Error(
          `MIDI note ${note.pitch} is not playable on a ${openStringPitches.length}-string bass`,
        );
      }
      return { note, start, end: start + duration, tabPosition };
    })
    .sort((a, b) => a.start - b.start || a.note.pitch - b.note.pitch);

  for (let index = 1; index < result.length; index++) {
    if (result[index].start < result[index - 1].end) {
      throw new Error(
        `Overlapping notes ${result[index - 1].note.id} and ${result[index].note.id} are not supported`,
      );
    }
  }
  return result;
}

function buildMeasureEvents({
  notes,
  measureStart,
  measureDuration,
}: {
  notes: QuantizedNote[];
  measureStart: number;
  measureDuration: number;
}): MeasureEvent[] {
  const measureEnd = measureStart + measureDuration;
  const events: MeasureEvent[] = [];
  let cursor = measureStart;

  for (const note of notes) {
    if (note.end <= measureStart || note.start >= measureEnd) {
      continue;
    }
    const noteStart = Math.max(note.start, measureStart);
    const noteEnd = Math.min(note.end, measureEnd);
    if (noteStart > cursor) {
      events.push(
        ...splitDuration({
          start: cursor - measureStart,
          duration: noteStart - cursor,
        }).map(({ duration, notation }) => ({
          type: "rest" as const,
          duration,
          notation,
        })),
      );
    }

    let pieceStart = noteStart;
    for (const piece of splitDuration({
      start: noteStart - measureStart,
      duration: noteEnd - noteStart,
    })) {
      const pieceEnd = pieceStart + piece.duration;
      events.push({
        type: "note",
        pitch: note.note.pitch,
        duration: piece.duration,
        notation: piece.notation,
        tabPosition: note.tabPosition,
        tieStart: pieceEnd < note.end,
        tieStop: pieceStart > note.start,
      });
      pieceStart = pieceEnd;
    }
    cursor = noteEnd;
  }

  if (cursor < measureEnd) {
    events.push(
      ...splitDuration({
        start: cursor - measureStart,
        duration: measureEnd - cursor,
      }).map(({ duration, notation }) => ({
        type: "rest" as const,
        duration,
        notation,
      })),
    );
  }
  return events;
}

function splitDuration({
  start,
  duration,
}: {
  start: number;
  duration: number;
}): { duration: number; notation: DurationNotation }[] {
  const result: { duration: number; notation: DurationNotation }[] = [];
  let cursor = start;
  let remaining = duration;
  while (remaining > 0) {
    const candidate = DURATION_CANDIDATES.find(
      (item) => item.duration <= remaining && cursor % item.alignment === 0,
    );
    if (!candidate) {
      throw new Error("Cannot represent note duration in MusicXML");
    }
    result.push({
      duration: candidate.duration,
      notation: {
        type: candidate.type,
        dots: candidate.dots,
        triplet: candidate.triplet,
      },
    });
    cursor += candidate.duration;
    remaining -= candidate.duration;
  }
  return result;
}

function renderMeasure({
  events,
  index,
  measureDuration,
  tempo,
  timeSignature,
  openStringPitches,
}: {
  events: MeasureEvent[];
  index: number;
  measureDuration: number;
  tempo: number;
  timeSignature: TimeSignature;
  openStringPitches: readonly number[];
}): string {
  const attributes =
    index === 0
      ? `
      <attributes>
        <divisions>${DIVISIONS}</divisions>
        <key>
          <fifths>0</fifths>
        </key>
        <time>
          <beats>${timeSignature.numerator}</beats>
          <beat-type>${timeSignature.denominator}</beat-type>
        </time>
        <staves>2</staves>
        <clef number="1">
          <sign>F</sign>
          <line>4</line>
        </clef>
        <clef number="2">
          <sign>TAB</sign>
        </clef>
${renderStaffDetails(openStringPitches)}
        <transpose>
          <diatonic>0</diatonic>
          <chromatic>0</chromatic>
          <octave-change>-1</octave-change>
        </transpose>
      </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no">
            <beat-unit>quarter</beat-unit>
            <per-minute>${tempo}</per-minute>
          </metronome>
        </direction-type>
        <staff>1</staff>
        <sound tempo="${tempo}"/>
      </direction>`
      : "";

  return `    <measure number="${index + 1}">${attributes}
${events.map((event) => renderEvent(event, 1)).join("\n")}
      <backup>
        <duration>${measureDuration}</duration>
      </backup>
${events.map((event) => renderEvent(event, 2)).join("\n")}
    </measure>`;
}

function renderStaffDetails(openStringPitches: readonly number[]): string {
  const tuning = [...openStringPitches].reverse();
  return `        <staff-details number="2">
          <staff-lines>${openStringPitches.length}</staff-lines>
${tuning
  .map((midi, index) => {
    const pitch = midiPitchToMusicXml(midi);
    return `          <staff-tuning line="${index + 1}">
            <tuning-step>${pitch.step}</tuning-step>${
              pitch.alter
                ? `
            <tuning-alter>${pitch.alter}</tuning-alter>`
                : ""
            }
            <tuning-octave>${pitch.octave}</tuning-octave>
          </staff-tuning>`;
  })
  .join("\n")}
        </staff-details>`;
}

function renderEvent(event: MeasureEvent, staff: 1 | 2): string {
  if (event.type === "rest") {
    return `      <note>
        <rest/>
        <duration>${event.duration}</duration>
        <voice>${staff === 1 ? 1 : 5}</voice>
${renderDurationNotation(event.notation)}
        <staff>${staff}</staff>
      </note>`;
  }

  const pitch = midiPitchToMusicXml(event.pitch);
  const ties = [
    event.tieStop ? '        <tie type="stop"/>' : "",
    event.tieStart ? '        <tie type="start"/>' : "",
  ]
    .filter(Boolean)
    .join("\n");
  const tiedNotations = [
    event.tieStop ? '          <tied type="stop"/>' : "",
    event.tieStart ? '          <tied type="start"/>' : "",
  ]
    .filter(Boolean)
    .join("\n");
  const technical =
    staff === 2
      ? `
          <technical>
            <string>${event.tabPosition.tabString}</string>
            <fret>${event.tabPosition.fret}</fret>
          </technical>`
      : "";
  const notations =
    tiedNotations || technical
      ? `
        <notations>
${tiedNotations}${technical}
        </notations>`
      : "";

  return `      <note>
        <pitch>
          <step>${pitch.step}</step>${
            pitch.alter
              ? `
          <alter>${pitch.alter}</alter>`
              : ""
          }
          <octave>${pitch.octave}</octave>
        </pitch>
        <duration>${event.duration}</duration>${
          ties
            ? `
${ties}`
            : ""
        }
        <voice>${staff === 1 ? 1 : 5}</voice>
${renderDurationNotation(event.notation)}
        <staff>${staff}</staff>${notations}
      </note>`;
}

function renderDurationNotation(notation: DurationNotation): string {
  return `        <type>${notation.type}</type>${"\n        <dot/>".repeat(notation.dots ?? 0)}${
    notation.triplet
      ? `
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
        </time-modification>`
      : ""
  }`;
}

function midiPitchToMusicXml(pitch: number): {
  step: string;
  alter: number;
  octave: number;
} {
  const pitchClasses = [
    ["C", 0],
    ["C", 1],
    ["D", 0],
    ["D", 1],
    ["E", 0],
    ["F", 0],
    ["F", 1],
    ["G", 0],
    ["G", 1],
    ["A", 0],
    ["A", 1],
    ["B", 0],
  ] as const;
  const [step, alter] = pitchClasses[pitch % 12];
  return { step, alter, octave: Math.floor(pitch / 12) };
}

function toGridUnits(value: number, label: string): number {
  const units = Math.round(value * DIVISIONS);
  if (Math.abs(value * DIVISIONS - units) > EPSILON) {
    throw new Error(`${label} is not aligned to a supported grid`);
  }
  return units;
}

function validateOpenStringPitches(pitches: readonly number[]): void {
  if (pitches.length === 0) {
    throw new Error("Add at least one open string before exporting MusicXML");
  }
  if (
    pitches.some(
      (pitch) => !Number.isInteger(pitch) || pitch < 0 || pitch > 127,
    )
  ) {
    throw new Error("Open-string pitches must be MIDI note numbers");
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
