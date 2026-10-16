export interface Soundfont {
  /** Identifies the SoundFont among those a synth has loaded */
  id: string;
  name: string;
  url: string;
  /**
   * Decodes every sample in a worker while the font loads. Set it for a font
   * whose presets each use most of the file, because otherwise a synth decodes
   * a preset's samples on the audio thread when the preset is selected, which
   * stalls every track until it finishes.
   */
  decodeInWorker?: boolean;
}

export const GENERAL_USER_SOUNDFONT: Soundfont = {
  id: "general-user",
  name: "GeneralUser GS",
  url: "/soundfonts/GeneralUserGS-2.0.3.sf3",
};

/**
 * SoundFonts bundled beside GeneralUser GS. A MIDI track selects one by
 * setting `soundfont` to its id and `program` to one of its presets. Each
 * preset plays a GeneralUser stand-in until the font has loaded.
 *
 * - `"flamestudios-telecaster-neck"`: a clean electric guitar recorded direct
 *   in. Its Muted preset plays muted strokes and ghost notes.
 */
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
