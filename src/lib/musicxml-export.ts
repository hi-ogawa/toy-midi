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

type MusicXMLScore = {
  title: string;
  part: MusicXMLPart;
};

type MusicXMLPart = {
  id: string;
  name: string;
  measures: MusicXMLMeasure[];
};

type MusicXMLMeasure = {
  number: number;
  attributes?: MusicXMLAttributes;
  direction?: MusicXMLDirection;
  notes: MusicXMLNote[];
};

type MusicXMLAttributes = {
  divisions: number;
  keyFifths: number;
  timeSignature: TimeSignature;
  clef: {
    sign: string;
    line: number;
  };
};

type MusicXMLDirection = {
  tempo: number;
};

type MusicXMLNote = {
  chord: boolean;
  durationDivisions: number;
  voice: number;
  notationDuration?: NotationDuration;
  rest?: true;
  pitch?: PitchInfo;
  tieStart?: boolean;
  tieStop?: boolean;
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

function createRest(durationDivisions: number): MusicXMLNote {
  return {
    chord: false,
    durationDivisions,
    voice: 1,
    notationDuration: getNotationDuration(durationDivisions),
    rest: true,
  };
}

function createPitchedNote(
  fragment: MeasureNoteFragment,
  options: { chord: boolean },
): MusicXMLNote {
  return {
    chord: options.chord,
    durationDivisions: fragment.durationDivisions,
    voice: 1,
    notationDuration: getNotationDuration(fragment.durationDivisions),
    pitch: midiToPitch(fragment.note.pitch),
    tieStart: fragment.tieStart,
    tieStop: fragment.tieStop,
  };
}

function buildMeasureNotes(
  notes: Note[],
  measureStart: number,
  measureEnd: number,
): MusicXMLNote[] {
  const fragments = buildMeasureFragments(notes, measureStart, measureEnd);
  const measureDuration = measureEnd - measureStart;
  const measureNotes: MusicXMLNote[] = [];
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
      measureNotes.push(createRest(groupStart - currentDivisions));
    }

    group.forEach((fragment, index) => {
      measureNotes.push(createPitchedNote(fragment, { chord: index > 0 }));
    });

    currentDivisions = Math.max(
      currentDivisions,
      ...group.map(
        (fragment) => fragment.startDivisions + fragment.durationDivisions,
      ),
    );
  }

  if (currentDivisions < measureDuration) {
    measureNotes.push(createRest(measureDuration - currentDivisions));
  }

  return measureNotes;
}

export function buildMusicXMLScore(
  options: MusicXMLExportOptions,
): MusicXMLScore {
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
  const measures: MusicXMLMeasure[] = [];

  for (let measureNumber = 1; measureNumber <= measureCount; measureNumber++) {
    const measureStart = (measureNumber - 1) * measureDuration;
    const measureEnd = measureStart + measureDuration;

    measures.push({
      number: measureNumber,
      attributes:
        measureNumber === 1
          ? {
              divisions: DIVISIONS_PER_QUARTER,
              keyFifths: 0,
              timeSignature,
              clef: { sign: "F", line: 4 },
            }
          : undefined,
      direction: measureNumber === 1 ? { tempo } : undefined,
      notes: buildMeasureNotes(sortedNotes, measureStart, measureEnd),
    });
  }

  return {
    title,
    part: {
      id: "P1",
      name: partName,
      measures,
    },
  };
}

function serializeMusicXMLScore(score: MusicXMLScore): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">',
    `  <work><work-title>${xmlEscape(score.title)}</work-title></work>`,
    `  <movement-title>${xmlEscape(score.title)}</movement-title>`,
    "  <part-list>",
    `    <score-part id="${score.part.id}">`,
    `      <part-name>${xmlEscape(score.part.name)}</part-name>`,
    "    </score-part>",
    "  </part-list>",
    `  <part id="${score.part.id}">`,
  ];

  for (const measure of score.part.measures) {
    lines.push(`    <measure number="${measure.number}">`);
    if (measure.attributes) {
      lines.push("      <attributes>");
      lines.push(
        `        <divisions>${measure.attributes.divisions}</divisions>`,
      );
      lines.push("        <key>");
      lines.push(`          <fifths>${measure.attributes.keyFifths}</fifths>`);
      lines.push("        </key>");
      lines.push("        <time>");
      lines.push(
        `          <beats>${measure.attributes.timeSignature.numerator}</beats>`,
      );
      lines.push(
        `          <beat-type>${measure.attributes.timeSignature.denominator}</beat-type>`,
      );
      lines.push("        </time>");
      lines.push("        <clef>");
      lines.push(`          <sign>${measure.attributes.clef.sign}</sign>`);
      lines.push(`          <line>${measure.attributes.clef.line}</line>`);
      lines.push("        </clef>");
      lines.push("      </attributes>");
    }
    if (measure.direction) {
      lines.push('      <direction placement="above">');
      lines.push("        <direction-type>");
      lines.push("          <metronome>");
      lines.push("            <beat-unit>quarter</beat-unit>");
      lines.push(
        `            <per-minute>${measure.direction.tempo}</per-minute>`,
      );
      lines.push("          </metronome>");
      lines.push("        </direction-type>");
      lines.push(`        <sound tempo="${measure.direction.tempo}"/>`);
      lines.push("      </direction>");
    }
    for (const note of measure.notes) {
      lines.push("      <note>");
      if (note.chord) {
        lines.push("        <chord/>");
      }
      if (note.rest) {
        lines.push("        <rest/>");
      } else if (note.pitch) {
        lines.push("        <pitch>");
        lines.push(`          <step>${note.pitch.step}</step>`);
        if (note.pitch.alter !== undefined) {
          lines.push(`          <alter>${note.pitch.alter}</alter>`);
        }
        lines.push(`          <octave>${note.pitch.octave}</octave>`);
        lines.push("        </pitch>");
      }
      lines.push(`        <duration>${note.durationDivisions}</duration>`);
      if (note.tieStop) {
        lines.push('        <tie type="stop"/>');
      }
      if (note.tieStart) {
        lines.push('        <tie type="start"/>');
      }
      lines.push(`        <voice>${note.voice}</voice>`);
      if (note.notationDuration) {
        lines.push(`        <type>${note.notationDuration.type}</type>`);
        for (let i = 0; i < note.notationDuration.dots; i++) {
          lines.push("        <dot/>");
        }
        if (note.notationDuration.timeModification) {
          lines.push("        <time-modification>");
          lines.push(
            `          <actual-notes>${note.notationDuration.timeModification.actualNotes}</actual-notes>`,
          );
          lines.push(
            `          <normal-notes>${note.notationDuration.timeModification.normalNotes}</normal-notes>`,
          );
          lines.push("        </time-modification>");
        }
      }
      if (note.tieStop || note.tieStart) {
        lines.push("        <notations>");
        if (note.tieStop) {
          lines.push('          <tied type="stop"/>');
        }
        if (note.tieStart) {
          lines.push('          <tied type="start"/>');
        }
        lines.push("        </notations>");
      }
      lines.push("      </note>");
    }
    lines.push("    </measure>");
  }

  lines.push("  </part>");
  lines.push("</score-partwise>");

  return lines.join("\n");
}

export function exportMusicXML(options: MusicXMLExportOptions): string {
  return serializeMusicXMLScore(buildMusicXMLScore(options));
}
