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
 * SoundFonts bundled beside GeneralUser GS. A MIDI track uses one by setting
 * `soundfont` to its id and `program` to one of its presets.
 *
 * - `"flamestudios-telecaster-bridge"`: a clean electric guitar, recorded direct
 *   in from a Telecaster's bridge pickup. Bright, with a sharp attack.
 * - `"flamestudios-telecaster-neck"`: the same guitar's neck pickup. Warmer and
 *   rounder.
 *
 * Both have a Muted preset for muted strokes and ghost notes.
 */
export const SOUNDFONTS = [
  {
    id: "flamestudios-telecaster-bridge",
    name: "Telecaster Bridge",
    url: "/soundfonts/FlameStudios-Telecaster-Bridge-SM-b50f761.sf3",
    decodeInWorker: true,
    presets: [
      { program: 0, name: "Standard" },
      { program: 1, name: "Muted" },
    ],
  },
  {
    id: "flamestudios-telecaster-neck",
    name: "Telecaster Neck",
    url: "/soundfonts/FlameStudios-Telecaster-Neck-SM-b50f761.sf3",
    decodeInWorker: true,
    presets: [
      { program: 0, name: "Standard" },
      { program: 1, name: "Muted" },
    ],
  },
] as const;

export type SoundfontId = (typeof SOUNDFONTS)[number]["id"];

export function findSoundfont(id: SoundfontId): (typeof SOUNDFONTS)[number] {
  return SOUNDFONTS.find((soundfont) => soundfont.id === id)!;
}
