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

type XmlNode =
  | string
  | {
      name: string;
      attrs?: Record<string, string | number>;
      children?: XmlNode[];
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

function serializeXmlNode(node: XmlNode, indent: number = 0): string {
  if (typeof node === "string") {
    return `${" ".repeat(indent)}${xmlEscape(node)}`;
  }

  const attrs = Object.entries(node.attrs ?? {})
    .map(([key, value]) => ` ${key}="${xmlEscape(String(value))}"`)
    .join("");
  const children = node.children ?? [];

  if (children.length === 0) {
    return `${" ".repeat(indent)}<${node.name}${attrs}/>`;
  }

  if (children.length === 1 && typeof children[0] === "string") {
    return `${" ".repeat(indent)}<${node.name}${attrs}>${xmlEscape(children[0])}</${node.name}>`;
  }
  if (
    node.name === "work" &&
    children.length === 1 &&
    typeof children[0] !== "string" &&
    children[0].children?.length === 1 &&
    typeof children[0].children[0] === "string"
  ) {
    const child = children[0];
    const childAttrs = Object.entries(child.attrs ?? {})
      .map(([key, value]) => ` ${key}="${xmlEscape(String(value))}"`)
      .join("");

    return `${" ".repeat(indent)}<${node.name}${attrs}><${child.name}${childAttrs}>${xmlEscape(children[0].children[0])}</${child.name}></${node.name}>`;
  }

  return [
    `${" ".repeat(indent)}<${node.name}${attrs}>`,
    ...children.map((child) => serializeXmlNode(child, indent + 2)),
    `${" ".repeat(indent)}</${node.name}>`,
  ].join("\n");
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

function serializeMusicXMLScore(score: MusicXMLScore): string {
  const documentNode: XmlNode = {
    name: "score-partwise",
    attrs: { version: "4.0" },
    children: [
      {
        name: "work",
        children: [{ name: "work-title", children: [score.title] }],
      },
      { name: "movement-title", children: [score.title] },
      {
        name: "part-list",
        children: [
          {
            name: "score-part",
            attrs: { id: score.part.id },
            children: [{ name: "part-name", children: [score.part.name] }],
          },
        ],
      },
      {
        name: "part",
        attrs: { id: score.part.id },
        children: score.part.measures.map((measure) => {
          const children: XmlNode[] = [];

          if (measure.attributes) {
            children.push({
              name: "attributes",
              children: [
                {
                  name: "divisions",
                  children: [String(measure.attributes.divisions)],
                },
                {
                  name: "key",
                  children: [
                    {
                      name: "fifths",
                      children: [String(measure.attributes.keyFifths)],
                    },
                  ],
                },
                {
                  name: "time",
                  children: [
                    {
                      name: "beats",
                      children: [
                        String(measure.attributes.timeSignature.numerator),
                      ],
                    },
                    {
                      name: "beat-type",
                      children: [
                        String(measure.attributes.timeSignature.denominator),
                      ],
                    },
                  ],
                },
                {
                  name: "clef",
                  children: [
                    {
                      name: "sign",
                      children: [measure.attributes.clef.sign],
                    },
                    {
                      name: "line",
                      children: [String(measure.attributes.clef.line)],
                    },
                  ],
                },
              ],
            });
          }

          if (measure.direction) {
            children.push({
              name: "direction",
              attrs: { placement: "above" },
              children: [
                {
                  name: "direction-type",
                  children: [
                    {
                      name: "metronome",
                      children: [
                        { name: "beat-unit", children: ["quarter"] },
                        {
                          name: "per-minute",
                          children: [String(measure.direction.tempo)],
                        },
                      ],
                    },
                  ],
                },
                { name: "sound", attrs: { tempo: measure.direction.tempo } },
              ],
            });
          }

          for (const note of measure.notes) {
            const noteChildren: XmlNode[] = [];

            if (note.chord) {
              noteChildren.push({ name: "chord" });
            }
            if (note.rest) {
              noteChildren.push({ name: "rest" });
            } else if (note.pitch) {
              const pitchChildren: XmlNode[] = [
                { name: "step", children: [note.pitch.step] },
              ];
              if (note.pitch.alter !== undefined) {
                pitchChildren.push({
                  name: "alter",
                  children: [String(note.pitch.alter)],
                });
              }
              pitchChildren.push({
                name: "octave",
                children: [String(note.pitch.octave)],
              });
              noteChildren.push({ name: "pitch", children: pitchChildren });
            }

            noteChildren.push({
              name: "duration",
              children: [String(note.durationDivisions)],
            });
            if (note.tieStop) {
              noteChildren.push({ name: "tie", attrs: { type: "stop" } });
            }
            if (note.tieStart) {
              noteChildren.push({ name: "tie", attrs: { type: "start" } });
            }
            noteChildren.push({
              name: "voice",
              children: [String(note.voice)],
            });

            if (note.notationDuration) {
              noteChildren.push({
                name: "type",
                children: [note.notationDuration.type],
              });
              for (let i = 0; i < note.notationDuration.dots; i++) {
                noteChildren.push({ name: "dot" });
              }
              if (note.notationDuration.timeModification) {
                noteChildren.push({
                  name: "time-modification",
                  children: [
                    {
                      name: "actual-notes",
                      children: [
                        String(
                          note.notationDuration.timeModification.actualNotes,
                        ),
                      ],
                    },
                    {
                      name: "normal-notes",
                      children: [
                        String(
                          note.notationDuration.timeModification.normalNotes,
                        ),
                      ],
                    },
                  ],
                });
              }
            }

            if (note.tieStop || note.tieStart) {
              const notationChildren: XmlNode[] = [];
              if (note.tieStop) {
                notationChildren.push({
                  name: "tied",
                  attrs: { type: "stop" },
                });
              }
              if (note.tieStart) {
                notationChildren.push({
                  name: "tied",
                  attrs: { type: "start" },
                });
              }
              noteChildren.push({
                name: "notations",
                children: notationChildren,
              });
            }

            children.push({ name: "note", children: noteChildren });
          }

          return {
            name: "measure",
            attrs: { number: measure.number },
            children,
          };
        }),
      },
    ],
  };

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    serializeXmlNode(documentNode),
  ].join("\n");
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
