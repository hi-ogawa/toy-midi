export const TAB_OPEN_STRING_PRESETS = {
  fourString: [43, 38, 33, 28], // G2 D2 A1 E1
  fiveString: [43, 38, 33, 28, 23], // G2 D2 A1 E1 B0
} as const;

const PITCH_CLASS_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export type TabPosition = {
  string: number;
  fret: number;
};

export function formatTabPosition({
  position,
  openStringPitches,
}: {
  position: TabPosition;
  openStringPitches: readonly number[];
}): string {
  const openPitch = openStringPitches[position.string - 1];
  return `${PITCH_CLASS_NAMES[openPitch % 12]}${position.fret}`;
}

export function getFret({
  pitch,
  string,
  openStringPitches,
}: {
  pitch: number;
  string: number;
  openStringPitches: readonly number[];
}): number | undefined {
  const openPitch = openStringPitches[string - 1];
  if (openPitch === undefined) {
    return undefined;
  }
  const fret = pitch - openPitch;
  return fret >= 0 ? fret : undefined;
}

export function getPlayableStrings({
  pitch,
  openStringPitches,
}: {
  pitch: number;
  openStringPitches: readonly number[];
}): number[] {
  return openStringPitches
    .map((_openPitch, index) => index + 1)
    .filter(
      (string) => getFret({ pitch, string, openStringPitches }) !== undefined,
    );
}

export function resolveTabPosition({
  pitch,
  openStringPitches,
  tabString,
}: {
  pitch: number;
  openStringPitches: readonly number[];
  tabString?: number;
}): TabPosition | undefined {
  const playableStrings = getPlayableStrings({ pitch, openStringPitches });
  const string =
    tabString && playableStrings.includes(tabString)
      ? tabString
      : playableStrings[0];
  if (!string) {
    return undefined;
  }
  return {
    string,
    fret: getFret({ pitch, string, openStringPitches })!,
  };
}

export function moveTabString({
  pitch,
  openStringPitches,
  tabString,
  direction,
}: {
  pitch: number;
  openStringPitches: readonly number[];
  tabString?: number;
  direction: "up" | "down";
}): number | undefined {
  const playableStrings = getPlayableStrings({ pitch, openStringPitches });
  const current = resolveTabPosition({ pitch, openStringPitches, tabString });
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
