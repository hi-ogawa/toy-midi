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

export function exportMusicXML(options: MusicXMLExportOptions): string {
  return serializeMusicXMLScore(buildMusicXMLScore(options));
}

function serializeMusicXMLScore(score: MusicXMLScore): string {
  const documentNode = h("score-partwise", { version: "4.0" }, [
    h("work", [h("work-title", [score.title])]),
    h("movement-title", [score.title]),
    h("part-list", [
      h("score-part", { id: score.part.id }, [
        h("part-name", [score.part.name]),
      ]),
    ]),
    h(
      "part",
      { id: score.part.id },
      score.part.measures.map((measure) => {
        return h("measure", { number: measure.number }, [
          measure.attributes &&
            h("attributes", [
              h("divisions", [String(measure.attributes.divisions)]),
              h("key", [h("fifths", [String(measure.attributes.keyFifths)])]),
              h("time", [
                h("beats", [
                  String(measure.attributes.timeSignature.numerator),
                ]),
                h("beat-type", [
                  String(measure.attributes.timeSignature.denominator),
                ]),
              ]),
              h("clef", [
                h("sign", [measure.attributes.clef.sign]),
                h("line", [String(measure.attributes.clef.line)]),
              ]),
            ]),
          measure.direction &&
            h("direction", { placement: "above" }, [
              h("direction-type", [
                h("metronome", [
                  h("beat-unit", ["quarter"]),
                  h("per-minute", [String(measure.direction.tempo)]),
                ]),
              ]),
              h("sound", { tempo: measure.direction.tempo }),
            ]),
          measure.notes.map((note) =>
            h("note", [
              note.chord && h("chord"),
              note.rest && h("rest"),
              note.pitch &&
                h("pitch", [
                  h("step", [note.pitch.step]),
                  note.pitch.alter !== undefined &&
                    h("alter", [String(note.pitch.alter)]),
                  h("octave", [String(note.pitch.octave)]),
                ]),
              h("duration", [String(note.durationDivisions)]),
              note.tieStop && h("tie", { type: "stop" }),
              note.tieStart && h("tie", { type: "start" }),
              h("voice", [String(note.voice)]),
              note.notationDuration && [
                h("type", [note.notationDuration.type]),
                Array.from({ length: note.notationDuration.dots }, () =>
                  h("dot"),
                ),
                note.notationDuration.timeModification &&
                  h("time-modification", [
                    h("actual-notes", [
                      String(
                        note.notationDuration.timeModification.actualNotes,
                      ),
                    ]),
                    h("normal-notes", [
                      String(
                        note.notationDuration.timeModification.normalNotes,
                      ),
                    ]),
                  ]),
              ],
              (note.tieStop || note.tieStart) &&
                h("notations", [
                  note.tieStop && h("tied", { type: "stop" }),
                  note.tieStart && h("tied", { type: "start" }),
                ]),
            ]),
          ),
        ]);
      }),
    ),
  ]);

  return `\
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
${serializeXmlNode(documentNode)}
`;
}

// xml utils

type XmlNode =
  | string
  | {
      name: string;
      attrs?: Record<string, string | number>;
      children?: XmlNode[];
    };

type XmlChild = XmlNode | false | null | undefined | XmlChild[];

function h(
  name: string,
  attrsOrChildren?: Record<string, string | number> | XmlChild[],
  children?: XmlChild[],
): XmlNode {
  if (Array.isArray(attrsOrChildren)) {
    return { name, children: normalizeXmlChildren(attrsOrChildren) };
  }
  return {
    name,
    attrs: attrsOrChildren,
    children: normalizeXmlChildren(children ?? []),
  };
}

function normalizeXmlChildren(children: XmlChild[]): XmlNode[] {
  return children.flatMap((child): XmlNode[] => {
    if (child === false || child === null || child === undefined) {
      return [];
    }
    if (Array.isArray(child)) {
      return normalizeXmlChildren(child);
    }
    return [child];
  });
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function serializeXmlNode(node: XmlNode, indent: string = ""): string {
  if (typeof node === "string") {
    return `${indent}${xmlEscape(node)}`;
  }

  const attrs = Object.entries(node.attrs ?? {})
    .map(([key, value]) => ` ${key}="${xmlEscape(String(value))}"`)
    .join("");
  const children = node.children ?? [];

  if (children.length === 0) {
    return `${indent}<${node.name}${attrs}/>`;
  }

  if (children.length === 1 && typeof children[0] === "string") {
    return `${indent}<${node.name}${attrs}>${xmlEscape(children[0])}</${node.name}>`;
  }
  return [
    `${indent}<${node.name}${attrs}>`,
    ...children.map((child) => serializeXmlNode(child, `${indent}  `)),
    `${indent}</${node.name}>`,
  ].join("\n");
}
