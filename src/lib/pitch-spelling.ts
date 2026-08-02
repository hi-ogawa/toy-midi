export interface KeySignature {
  fifths: number; // Number of flats (-) or sharps (+)
  mode: "major" | "minor";
}

type NoteLetter = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export type SpelledPitch = {
  step: NoteLetter;
  alter: number;
  octave: number;
};

export const KEY_SIGNATURES: (KeySignature & { label: string })[] = [
  { fifths: -7, mode: "major", label: "C-flat major" },
  { fifths: -6, mode: "major", label: "G-flat major" },
  { fifths: -5, mode: "major", label: "D-flat major" },
  { fifths: -4, mode: "major", label: "A-flat major" },
  { fifths: -3, mode: "major", label: "E-flat major" },
  { fifths: -2, mode: "major", label: "B-flat major" },
  { fifths: -1, mode: "major", label: "F major" },
  { fifths: 0, mode: "major", label: "C major" },
  { fifths: 1, mode: "major", label: "G major" },
  { fifths: 2, mode: "major", label: "D major" },
  { fifths: 3, mode: "major", label: "A major" },
  { fifths: 4, mode: "major", label: "E major" },
  { fifths: 5, mode: "major", label: "B major" },
  { fifths: 6, mode: "major", label: "F-sharp major" },
  { fifths: 7, mode: "major", label: "C-sharp major" },
  { fifths: -7, mode: "minor", label: "A-flat minor" },
  { fifths: -6, mode: "minor", label: "E-flat minor" },
  { fifths: -5, mode: "minor", label: "B-flat minor" },
  { fifths: -4, mode: "minor", label: "F minor" },
  { fifths: -3, mode: "minor", label: "C minor" },
  { fifths: -2, mode: "minor", label: "G minor" },
  { fifths: -1, mode: "minor", label: "D minor" },
  { fifths: 0, mode: "minor", label: "A minor" },
  { fifths: 1, mode: "minor", label: "E minor" },
  { fifths: 2, mode: "minor", label: "B minor" },
  { fifths: 3, mode: "minor", label: "F-sharp minor" },
  { fifths: 4, mode: "minor", label: "C-sharp minor" },
  { fifths: 5, mode: "minor", label: "G-sharp minor" },
  { fifths: 6, mode: "minor", label: "D-sharp minor" },
  { fifths: 7, mode: "minor", label: "A-sharp minor" },
];

const NATURAL_PITCH_CLASS_BY_LETTER: Record<NoteLetter, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
} as const;

const SHARP_ACCIDENTAL_ORDER = ["F", "C", "G", "D", "A", "E", "B"] as const;
const FLAT_ACCIDENTAL_ORDER = ["B", "E", "A", "D", "G", "C", "F"] as const;

const SHARP_CHROMATIC_SPELLINGS = [
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

const FLAT_CHROMATIC_SPELLINGS = [
  ["C", 0],
  ["D", -1],
  ["D", 0],
  ["E", -1],
  ["E", 0],
  ["F", 0],
  ["G", -1],
  ["G", 0],
  ["A", -1],
  ["A", 0],
  ["B", -1],
  ["B", 0],
] as const;

// MuseScore similarly derives diatonic spellings from the exact key signature,
// then applies heuristics to chromatic notes. See pitchspelling.cpp, especially
// pitch2tpc(), computeWindow(), and spellNotelist().
export function spellMidiPitch({
  pitch,
  keySignature,
}: {
  pitch: number;
  keySignature: KeySignature;
}): SpelledPitch {
  const accidentalOrder =
    keySignature.fifths < 0 ? FLAT_ACCIDENTAL_ORDER : SHARP_ACCIDENTAL_ORDER;
  const keyAlter = Math.sign(keySignature.fifths);
  const alteredSteps = new Set(
    accidentalOrder.slice(0, Math.abs(keySignature.fifths)),
  );
  const pitchClass = pitch % 12;
  // Prefer the exact spelling of a scale tone in this key, including altered
  // naturals such as C-flat in E-flat minor and E-sharp in D-sharp minor.
  for (const step of Object.keys(
    NATURAL_PITCH_CLASS_BY_LETTER,
  ) as NoteLetter[]) {
    const naturalPitchClass = NATURAL_PITCH_CLASS_BY_LETTER[step];
    const alter = alteredSteps.has(step) ? keyAlter : 0;
    if ((naturalPitchClass + alter + 12) % 12 === pitchClass) {
      return toSpelledPitch({ pitch, step, alter });
    }
  }

  // Chromatic fallback:
  //   key signature has flats    => prefer flats
  //   key signature has no flats => prefer sharps
  // `fifths` is MusicXML's signed count: negative for flats, positive for
  // sharps, and zero for C major or A minor.
  // Examples:
  //   F major,  pitch class 10 -> Bb (correct: Bb chord)
  //   A minor,  pitch class 8  -> G# (correct: E7)
  //   C major,  pitch class 10 -> A# (wrong: Bb in Gm7 -> C7 -> F)
  //   C major,  pitch class 1  -> C# (correct: A7; wrong: Db in Db7)
  //   A minor,  pitch class 8  -> G# (correct: E7; wrong: Ab in Ab7)
  // TODO: Prefer common chromatic spellings. Contextual cases require harmonic
  // analysis or an explicit per-note spelling choice.
  const chromaticSpellings =
    keySignature.fifths < 0
      ? FLAT_CHROMATIC_SPELLINGS
      : SHARP_CHROMATIC_SPELLINGS;
  const [step, alter] = chromaticSpellings[pitch % 12];
  return toSpelledPitch({ pitch, step, alter });
}

export function spellChromaticPitch(pitch: number): SpelledPitch {
  const chromaticSpellings = SHARP_CHROMATIC_SPELLINGS;
  const [step, alter] = chromaticSpellings[pitch % 12];
  return toSpelledPitch({ pitch, step, alter });
}

export function formatChromaticPitch(pitch: number): string {
  const { step, alter, octave } = spellChromaticPitch(pitch);
  const accidental = alter === -1 ? "b" : alter === 1 ? "#" : "";
  return `${step}${accidental}${octave}`;
}

function toSpelledPitch({
  pitch,
  step,
  alter,
}: {
  pitch: number;
  step: NoteLetter;
  alter: number;
}): SpelledPitch {
  return {
    step,
    alter,
    // Derive the written octave after applying the accidental because C-flat
    // and B-sharp cross the C octave boundary relative to their sounding pitch.
    octave:
      Math.floor((pitch - NATURAL_PITCH_CLASS_BY_LETTER[step] - alter) / 12) -
      1,
  };
}
