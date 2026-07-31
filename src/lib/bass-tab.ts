import type { BassString, BassStringCount } from "../types";

const OPEN_STRING_PITCHES: Record<BassString, number> = {
  1: 43, // G2
  2: 38, // D2
  3: 33, // A1
  4: 28, // E1
  5: 23, // B0
};

export type BassTabPosition = {
  string: BassString;
  fret: number;
};

export function getFret(pitch: number, string: BassString): number | undefined {
  const fret = pitch - OPEN_STRING_PITCHES[string];
  return fret >= 0 ? fret : undefined;
}

export function getPlayableStrings({
  pitch,
  stringCount,
}: {
  pitch: number;
  stringCount: BassStringCount;
}): BassString[] {
  const strings: BassString[] =
    stringCount === 4 ? [1, 2, 3, 4] : [1, 2, 3, 4, 5];
  return strings.filter((string) => getFret(pitch, string) !== undefined);
}

export function resolveBassTabPosition({
  pitch,
  stringCount,
  bassString,
}: {
  pitch: number;
  stringCount: BassStringCount;
  bassString?: BassString;
}): BassTabPosition | undefined {
  const playableStrings = getPlayableStrings({ pitch, stringCount });
  const string =
    bassString && playableStrings.includes(bassString)
      ? bassString
      : playableStrings[0];
  if (!string) {
    return undefined;
  }
  return { string, fret: getFret(pitch, string)! };
}

export function moveBassString({
  pitch,
  stringCount,
  bassString,
  direction,
}: {
  pitch: number;
  stringCount: BassStringCount;
  bassString?: BassString;
  direction: "up" | "down";
}): BassString | undefined {
  const playableStrings = getPlayableStrings({ pitch, stringCount });
  const current = resolveBassTabPosition({ pitch, stringCount, bassString });
  if (!current) {
    return undefined;
  }
  const index = playableStrings.indexOf(current.string);
  const nextIndex = Math.max(
    0,
    Math.min(playableStrings.length - 1, index + (direction === "up" ? -1 : 1)),
  );
  return playableStrings[nextIndex];
}
