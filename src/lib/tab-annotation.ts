import type { TabString } from "../types";

export const TAB_STRING_PRESETS = [
  {
    id: "fourStringBass",
    label: "4-string bass (EADG)",
    openStringPitches: [43, 38, 33, 28], // G2 D2 A1 E1
  },
  {
    id: "fiveStringBass",
    label: "5-string bass (BEADG)",
    openStringPitches: [43, 38, 33, 28, 23], // G2 D2 A1 E1 B0
  },
] as const;

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
  tabString: TabString;
  fret: number;
};

export type TabStringMove = {
  before: TabString;
  after: TabString;
};

export function resolveTabStringPreset(openStringPitches: readonly number[]) {
  return TAB_STRING_PRESETS.find(
    (preset) =>
      preset.openStringPitches.length === openStringPitches.length &&
      preset.openStringPitches.every(
        (pitch, index) => pitch === openStringPitches[index],
      ),
  );
}

export function getTabStringColor(tabString: TabString) {
  return TAB_STRING_COLORS[tabString - 1];
}

export function formatTabPosition({
  position,
  openStringPitches,
}: {
  position: TabPosition;
  openStringPitches: readonly number[];
}): string {
  const openPitch = openStringPitches[position.tabString - 1];
  return `${PITCH_CLASS_NAMES[openPitch % 12]}${position.fret}`;
}

export function getFret({
  pitch,
  tabString,
  openStringPitches,
}: {
  pitch: number;
  tabString: TabString;
  openStringPitches: readonly number[];
}): number | undefined {
  const openPitch = openStringPitches[tabString - 1];
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
}): TabString[] {
  return openStringPitches
    .map((_openPitch, index) => (index + 1) as TabString)
    .filter(
      (tabString) =>
        getFret({ pitch, tabString, openStringPitches }) !== undefined,
    );
}

export function resolveTabPosition({
  pitch,
  openStringPitches,
  tabString,
}: {
  pitch: number;
  openStringPitches: readonly number[];
  tabString?: TabString;
}): TabPosition | undefined {
  const playableStrings = getPlayableStrings({ pitch, openStringPitches });
  const resolvedTabString =
    tabString && playableStrings.includes(tabString)
      ? tabString
      : playableStrings[0];
  if (!resolvedTabString) {
    return undefined;
  }
  return {
    tabString: resolvedTabString,
    fret: getFret({ pitch, tabString: resolvedTabString, openStringPitches })!,
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
  tabString?: TabString;
  direction: "up" | "down";
}): TabStringMove | undefined {
  const current = resolveTabPosition({ pitch, openStringPitches, tabString });
  if (!current) {
    return undefined;
  }
  const playableStrings = getPlayableStrings({ pitch, openStringPitches });
  const index = playableStrings.indexOf(current.tabString);
  const nextIndex = Math.max(
    0,
    Math.min(playableStrings.length - 1, index + (direction === "up" ? -1 : 1)),
  );
  return {
    before: current.tabString,
    after: playableStrings[nextIndex],
  };
}
