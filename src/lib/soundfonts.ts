// SoundFonts bundled beside GeneralUser GS. Tracks name one by id, and each
// preset has a GeneralUser stand-in that plays while the font downloads.
export const SOUNDFONTS = [
  {
    id: "flamestudios-telecaster-neck",
    name: "Telecaster",
    url: "/soundfonts/FlameStudios-Telecaster-Neck-SM-b50f761.sf3",
    presets: [
      { program: 0, name: "Standard", standIn: { program: 27 } },
      { program: 1, name: "Muted", standIn: { program: 28 } },
    ],
  },
] as const;

export type SoundfontId = (typeof SOUNDFONTS)[number]["id"];

export type Soundfont = (typeof SOUNDFONTS)[number];

export function findSoundfont(id: SoundfontId): Soundfont {
  return SOUNDFONTS.find((soundfont) => soundfont.id === id)!;
}
