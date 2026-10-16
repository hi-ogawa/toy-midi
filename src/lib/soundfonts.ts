export interface Soundfont {
  /** Identifies the SoundFont among those a synth has loaded */
  id: string;
  name: string;
  url: string;
  /**
   * Decode every sample in a worker while the font loads, for a font whose
   * presets each use most of the file. Otherwise a synth decodes a preset's
   * samples on the audio thread when the preset is selected, which stalls
   * every track for as long as that takes.
   */
  decodeInWorker?: boolean;
}

export const GENERAL_USER_SOUNDFONT: Soundfont = {
  id: "general-user",
  name: "GeneralUser GS",
  url: "/soundfonts/GeneralUserGS-2.0.3.sf3",
};

// SoundFonts bundled beside GeneralUser GS. Tracks name one by id, and each
// preset has a GeneralUser stand-in that plays while the font downloads.
export const SOUNDFONTS = [
  {
    id: "flamestudios-telecaster-neck",
    name: "Telecaster",
    url: "/soundfonts/FlameStudios-Telecaster-Neck-SM-b50f761.sf3",
    decodeInWorker: true,
    presets: [
      { program: 0, name: "Standard", standIn: { program: 27 } },
      { program: 1, name: "Muted", standIn: { program: 28 } },
    ],
  },
] as const;

export type SoundfontId = (typeof SOUNDFONTS)[number]["id"];

export function findSoundfont(id: SoundfontId): (typeof SOUNDFONTS)[number] {
  return SOUNDFONTS.find((soundfont) => soundfont.id === id)!;
}
