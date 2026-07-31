import type { TabString, TabStringCount } from "../types";

const OPEN_STRING_PITCHES: Record<TabString, number> = {
  1: 43, // G2
  2: 38, // D2
  3: 33, // A1
  4: 28, // E1
  5: 23, // B0
};

export type TabPosition = {
  string: TabString;
  fret: number;
};

export function getFret(pitch: number, string: TabString): number | undefined {
  const fret = pitch - OPEN_STRING_PITCHES[string];
  return fret >= 0 ? fret : undefined;
}

export function getPlayableStrings({
  pitch,
  stringCount,
}: {
  pitch: number;
  stringCount: TabStringCount;
}): TabString[] {
  const strings: TabString[] =
    stringCount === 4 ? [1, 2, 3, 4] : [1, 2, 3, 4, 5];
  return strings.filter((string) => getFret(pitch, string) !== undefined);
}

export function resolveTabPosition({
  pitch,
  stringCount,
  tabString,
}: {
  pitch: number;
  stringCount: TabStringCount;
  tabString?: TabString;
}): TabPosition | undefined {
  const playableStrings = getPlayableStrings({ pitch, stringCount });
  const string =
    tabString && playableStrings.includes(tabString)
      ? tabString
      : playableStrings[0];
  if (!string) {
    return undefined;
  }
  return { string, fret: getFret(pitch, string)! };
}

export function moveTabString({
  pitch,
  stringCount,
  tabString,
  direction,
}: {
  pitch: number;
  stringCount: TabStringCount;
  tabString?: TabString;
  direction: "up" | "down";
}): TabString | undefined {
  const playableStrings = getPlayableStrings({ pitch, stringCount });
  const current = resolveTabPosition({ pitch, stringCount, tabString });
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
