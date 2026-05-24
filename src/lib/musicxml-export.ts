import { Note, TimeSignature } from "../types";

export interface MusicXMLExportOptions {
  notes: Note[];
  tempo: number;
  timeSignature: TimeSignature;
  title: string;
  partName: string;
}

const DIVISIONS_PER_QUARTER = 24;

type PitchInfo = {
  step: string;
  alter?: number;
  octave: number;
};

type NotationDuration = {
  type: string;
  dots: number;
  timeModification?: {
    actualNotes: number;
    normalNotes: number;
  };
};

type MeasureNoteFragment = {
  note: Note;
  startDivisions: number;
  durationDivisions: number;
  tieStart: boolean;
  tieStop: boolean;
};

const PITCH_STEPS: Array<{ step: string; alter?: number }> = [
  { step: "C" },
  { step: "C", alter: 1 },
  { step: "D" },
  { step: "D", alter: 1 },
  { step: "E" },
  { step: "F" },
  { step: "F", alter: 1 },
  { step: "G" },
  { step: "G", alter: 1 },
  { step: "A" },
  { step: "A", alter: 1 },
  { step: "B" },
];

const DURATION_BY_DIVISIONS = new Map<number, NotationDuration>([
  [DIVISIONS_PER_QUARTER * 4, { type: "whole", dots: 0 }],
  [DIVISIONS_PER_QUARTER * 3, { type: "half", dots: 1 }],
  [DIVISIONS_PER_QUARTER * 2, { type: "half", dots: 0 }],
  [DIVISIONS_PER_QUARTER * 1.5, { type: "quarter", dots: 1 }],
  [DIVISIONS_PER_QUARTER, { type: "quarter", dots: 0 }],
  [DIVISIONS_PER_QUARTER * 0.75, { type: "eighth", dots: 1 }],
  [DIVISIONS_PER_QUARTER * 0.5, { type: "eighth", dots: 0 }],
  [
    DIVISIONS_PER_QUARTER / 3,
    {
      type: "eighth",
      dots: 0,
      timeModification: { actualNotes: 3, normalNotes: 2 },
    },
  ],
  [DIVISIONS_PER_QUARTER * 0.375, { type: "16th", dots: 1 }],
  [DIVISIONS_PER_QUARTER * 0.25, { type: "16th", dots: 0 }],
  [
    DIVISIONS_PER_QUARTER / 6,
    {
      type: "16th",
      dots: 0,
      timeModification: { actualNotes: 3, normalNotes: 2 },
    },
  ],
  [DIVISIONS_PER_QUARTER * 0.125, { type: "32nd", dots: 0 }],
  [
    DIVISIONS_PER_QUARTER / 12,
    {
      type: "32nd",
      dots: 0,
      timeModification: { actualNotes: 3, normalNotes: 2 },
    },
  ],
]);

function beatsToDivisions(beats: number): number {
  return Math.round(beats * DIVISIONS_PER_QUARTER);
}

function measureDurationDivisions(timeSignature: TimeSignature): number {
  return beatsToDivisions(
    timeSignature.numerator * (4 / timeSignature.denominator),
  );
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function midiToPitch(pitch: number): PitchInfo {
  const pitchClass = pitch % 12;
  const pitchStep = PITCH_STEPS[pitchClass];

  return {
    step: pitchStep.step,
    alter: pitchStep.alter,
    octave: Math.floor(pitch / 12) - 1,
  };
}

function getNotationDuration(
  durationDivisions: number,
): NotationDuration | undefined {
  return DURATION_BY_DIVISIONS.get(durationDivisions);
}

function pushNotationDuration(
  lines: string[],
  durationDivisions: number,
): void {
  const notationDuration = getNotationDuration(durationDivisions);

  if (!notationDuration) {
    return;
  }

  lines.push(`        <type>${notationDuration.type}</type>`);
  for (let i = 0; i < notationDuration.dots; i++) {
    lines.push("        <dot/>");
  }
  if (notationDuration.timeModification) {
    lines.push("        <time-modification>");
    lines.push(
      `          <actual-notes>${notationDuration.timeModification.actualNotes}</actual-notes>`,
    );
    lines.push(
      `          <normal-notes>${notationDuration.timeModification.normalNotes}</normal-notes>`,
    );
    lines.push("        </time-modification>");
  }
}

function pushPitch(lines: string[], pitch: number): void {
  const pitchInfo = midiToPitch(pitch);

  lines.push("        <pitch>");
  lines.push(`          <step>${pitchInfo.step}</step>`);
  if (pitchInfo.alter !== undefined) {
    lines.push(`          <alter>${pitchInfo.alter}</alter>`);
  }
  lines.push(`          <octave>${pitchInfo.octave}</octave>`);
  lines.push("        </pitch>");
}

function pushRest(lines: string[], durationDivisions: number): void {
  lines.push("      <note>");
  lines.push("        <rest/>");
  lines.push(`        <duration>${durationDivisions}</duration>`);
  lines.push("        <voice>1</voice>");
  pushNotationDuration(lines, durationDivisions);
  lines.push("      </note>");
}

function pushNote(
  lines: string[],
  fragment: MeasureNoteFragment,
  options: { chord: boolean },
): void {
  lines.push("      <note>");
  if (options.chord) {
    lines.push("        <chord/>");
  }
  pushPitch(lines, fragment.note.pitch);
  lines.push(`        <duration>${fragment.durationDivisions}</duration>`);
  if (fragment.tieStop) {
    lines.push('        <tie type="stop"/>');
  }
  if (fragment.tieStart) {
    lines.push('        <tie type="start"/>');
  }
  lines.push("        <voice>1</voice>");
  pushNotationDuration(lines, fragment.durationDivisions);
  if (fragment.tieStop || fragment.tieStart) {
    lines.push("        <notations>");
    if (fragment.tieStop) {
      lines.push('          <tied type="stop"/>');
    }
    if (fragment.tieStart) {
      lines.push('          <tied type="start"/>');
    }
    lines.push("        </notations>");
  }
  lines.push("      </note>");
}

function buildMeasureFragments(
  notes: Note[],
  measureStartDivisions: number,
  measureEndDivisions: number,
): MeasureNoteFragment[] {
  const fragments: MeasureNoteFragment[] = [];

  for (const note of notes) {
    const noteStartDivisions = beatsToDivisions(note.start);
    const noteEndDivisions = beatsToDivisions(note.start + note.duration);
    const fragmentStartDivisions = Math.max(
      noteStartDivisions,
      measureStartDivisions,
    );
    const fragmentEndDivisions = Math.min(
      noteEndDivisions,
      measureEndDivisions,
    );

    if (fragmentStartDivisions >= fragmentEndDivisions) {
      continue;
    }

    fragments.push({
      note,
      startDivisions: fragmentStartDivisions - measureStartDivisions,
      durationDivisions: fragmentEndDivisions - fragmentStartDivisions,
      tieStart: fragmentEndDivisions < noteEndDivisions,
      tieStop: fragmentStartDivisions > noteStartDivisions,
    });
  }

  return fragments.sort((a, b) => {
    if (a.startDivisions !== b.startDivisions) {
      return a.startDivisions - b.startDivisions;
    }
    return a.note.pitch - b.note.pitch;
  });
}

function pushAttributes(
  lines: string[],
  timeSignature: TimeSignature,
  options: { includeTime: boolean },
): void {
  lines.push("      <attributes>");
  lines.push(`        <divisions>${DIVISIONS_PER_QUARTER}</divisions>`);
  lines.push("        <key>");
  lines.push("          <fifths>0</fifths>");
  lines.push("        </key>");
  if (options.includeTime) {
    lines.push("        <time>");
    lines.push(`          <beats>${timeSignature.numerator}</beats>`);
    lines.push(`          <beat-type>${timeSignature.denominator}</beat-type>`);
    lines.push("        </time>");
  }
  lines.push("        <clef>");
  lines.push("          <sign>F</sign>");
  lines.push("          <line>4</line>");
  lines.push("        </clef>");
  lines.push("      </attributes>");
}

function pushTempoDirection(lines: string[], tempo: number): void {
  lines.push('      <direction placement="above">');
  lines.push("        <direction-type>");
  lines.push("          <metronome>");
  lines.push("            <beat-unit>quarter</beat-unit>");
  lines.push(`            <per-minute>${tempo}</per-minute>`);
  lines.push("          </metronome>");
  lines.push("        </direction-type>");
  lines.push('        <sound tempo="' + tempo + '"/>');
  lines.push("      </direction>");
}

function pushMeasure(
  lines: string[],
  notes: Note[],
  measureNumber: number,
  measureDuration: number,
  timeSignature: TimeSignature,
  tempo: number,
): void {
  const measureStart = (measureNumber - 1) * measureDuration;
  const measureEnd = measureStart + measureDuration;
  const fragments = buildMeasureFragments(notes, measureStart, measureEnd);

  lines.push(`    <measure number="${measureNumber}">`);
  if (measureNumber === 1) {
    pushAttributes(lines, timeSignature, { includeTime: true });
    pushTempoDirection(lines, tempo);
  }

  let currentDivisions = 0;
  let fragmentIndex = 0;
  while (fragmentIndex < fragments.length) {
    const groupStart = fragments[fragmentIndex].startDivisions;
    const group: MeasureNoteFragment[] = [];

    while (
      fragmentIndex < fragments.length &&
      fragments[fragmentIndex].startDivisions === groupStart
    ) {
      group.push(fragments[fragmentIndex]);
      fragmentIndex++;
    }

    if (groupStart > currentDivisions) {
      pushRest(lines, groupStart - currentDivisions);
    }

    group.forEach((fragment, index) => {
      pushNote(lines, fragment, { chord: index > 0 });
    });

    currentDivisions = Math.max(
      currentDivisions,
      ...group.map(
        (fragment) => fragment.startDivisions + fragment.durationDivisions,
      ),
    );
  }

  if (currentDivisions < measureDuration) {
    pushRest(lines, measureDuration - currentDivisions);
  }

  lines.push("    </measure>");
}

export function exportMusicXML(options: MusicXMLExportOptions): string {
  const { notes, tempo, timeSignature, title, partName } = options;
  const sortedNotes = [...notes].sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    return a.pitch - b.pitch;
  });
  const measureDuration = measureDurationDivisions(timeSignature);
  const maxNoteEnd = sortedNotes.reduce(
    (maxEnd, note) =>
      Math.max(maxEnd, beatsToDivisions(note.start + note.duration)),
    0,
  );
  const measureCount = Math.max(1, Math.ceil(maxNoteEnd / measureDuration));
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">',
    `  <work><work-title>${xmlEscape(title)}</work-title></work>`,
    `  <movement-title>${xmlEscape(title)}</movement-title>`,
    "  <part-list>",
    '    <score-part id="P1">',
    `      <part-name>${xmlEscape(partName)}</part-name>`,
    "    </score-part>",
    "  </part-list>",
    '  <part id="P1">',
  ];

  for (let measureNumber = 1; measureNumber <= measureCount; measureNumber++) {
    pushMeasure(
      lines,
      sortedNotes,
      measureNumber,
      measureDuration,
      timeSignature,
      tempo,
    );
  }

  lines.push("  </part>");
  lines.push("</score-partwise>");

  return lines.join("\n");
}
