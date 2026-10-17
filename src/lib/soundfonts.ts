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
 * setting `soundfont` to its id and `program` to one of its presets. Until the
 * font has loaded, the track plays GeneralUser's preset with the same program.
 *
 * - `"flamestudios-telecaster-bridge"`: a clean electric guitar from a
 *   Telecaster's bridge pickup, recorded direct in. It's bright with a sharp
 *   attack, so it cuts through a full arrangement, which makes it the default
 *   for clean electric parts. A track EQ that trims the highs warms it up.
 * - `"flamestudios-telecaster-neck"`: the same guitar's neck pickup, warmer
 *   and rounder, for jazz, neo-soul, ballads, or a guitar that plays alone.
 *
 * Both have a Muted preset that plays muted strokes and ghost notes.
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
