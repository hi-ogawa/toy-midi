export const TAB_OPEN_STRING_PRESETS = {
  fourString: [43, 38, 33, 28], // G2 D2 A1 E1
  fiveString: [43, 38, 33, 28, 23], // G2 D2 A1 E1 B0
} as const;

export const TAB_STRING_SETUPS = [
  {
    id: "fourString",
    label: "4-string bass",
    openStringPitches: TAB_OPEN_STRING_PRESETS.fourString,
  },
  {
    id: "fiveString",
    label: "5-string bass",
    openStringPitches: TAB_OPEN_STRING_PRESETS.fiveString,
  },
] as const;

export type TabStringSetupId = (typeof TAB_STRING_SETUPS)[number]["id"];

const TAB_STRING_COLORS = [
  { background: "#06b6d4", border: "#0891b2", text: "#083344" },
  { background: "#22c55e", border: "#16a34a", text: "#052e16" },
  { background: "#eab308", border: "#ca8a04", text: "#422006" },
  { background: "#f97316", border: "#ea580c", text: "#431407" },
  { background: "#a855f7", border: "#9333ea", text: "#2e1065" },
] as const;

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

export function resolveTabStringSetup(openStringPitches: readonly number[]) {
  return TAB_STRING_SETUPS.find(
    (setup) =>
      setup.openStringPitches.length === openStringPitches.length &&
      setup.openStringPitches.every(
        (pitch, index) => pitch === openStringPitches[index],
      ),
  );
}

export function getTabStringColor(string: number) {
  return TAB_STRING_COLORS[string - 1];
}

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
