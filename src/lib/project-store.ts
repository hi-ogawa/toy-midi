import {
  DEFAULT_TIME_SIGNATURE,
  type GridSnap,
  type Locator,
  type Note,
  type TimeSignature,
} from "../types";
import type { KeySignature } from "./pitch-spelling";
import { TAB_STRING_PRESETS } from "./tab-annotation";
import { DEFAULT_PIXELS_PER_BEAT } from "./timeline";

const DEFAULT_WAVEFORM_HEIGHT = 60;

const STORAGE_VERSION = 2;

export interface SavedProject {
  version: 2;
  notes: Note[];
  tempo: number;
  timeSignature?: TimeSignature; // Optional for backward compatibility
  keySignature?: KeySignature;
  gridSnap: GridSnap;
  tabAnnotationEnabled?: boolean;
  tabOpenStringPitches?: number[];
  locators?: Locator[]; // Optional for backward compatibility
  audioTracks: (Omit<SavedAudioTrack, "waveformHeight"> & {
    waveformHeight?: number; // Optional for backward compatibility
  })[];
  masterVolume?: number;
  midiVolume: number;
  midiMuted?: boolean; // Optional for backward compatibility
  midiSoloed?: boolean;
  midiProgram?: number; // Optional for backward compatibility
  metronomeEnabled: boolean;
  metronomeVolume: number;
  autoScrollEnabled?: boolean;
  linkAudioOffsetsEnabled?: boolean; // Optional for backward compatibility
  // Viewport state
  scrollX?: number;
  scrollY?: number;
  pixelsPerBeat?: number;
  pixelsPerKey?: number;
  waveformHeight?: number;
}

interface SavedAudioTrack {
  id: string;
  fileName: string;
  assetKey: string;
  duration: number;
  offset: number;
  volume: number;
  muted: boolean;
  soloed?: boolean;
  waveformHeight: number;
}

export type SavedProjectV1 = Omit<SavedProject, "version" | "audioTracks"> & {
  version: 1;
  audioFileName: string | null;
  audioAssetKey: string | null;
  audioDuration: number;
  audioOffset: number;
  audioVolume: number;
  audioMuted?: boolean; // Optional for backward compatibility
};

export type AnySavedProject = SavedProjectV1 | SavedProject;

// Default values for new/missing fields
const DEFAULTS = {
  notes: [],
  tempo: 120,
  timeSignature: DEFAULT_TIME_SIGNATURE,
  keySignature: { fifths: 0, mode: "major" },
  gridSnap: "1/8",
  tabAnnotationEnabled: false,
  tabOpenStringPitches: [...TAB_STRING_PRESETS[0].openStringPitches],
  locators: [],
  audioTracks: [],
  masterVolume: 1,
  midiVolume: 0.8,
  midiMuted: false,
  midiSoloed: false,
  midiProgram: 0,
  metronomeEnabled: false,
  metronomeVolume: 0.5,
  autoScrollEnabled: true,
  linkAudioOffsetsEnabled: true,
  // Viewport state defaults
  scrollX: 0,
  scrollY: 51, // MAX_PITCH (127) - DEFAULT_VIEW_MAX_PITCH (76)
  pixelsPerBeat: DEFAULT_PIXELS_PER_BEAT,
  pixelsPerKey: 20,
} satisfies Omit<SavedProject, "version">;

export function createDefaultSavedProject(): SavedProject {
  return { version: STORAGE_VERSION, ...DEFAULTS };
}

export function migrateSavedProject(data: AnySavedProject): SavedProject {
  if (data.version === 1) {
    return {
      ...data,
      version: STORAGE_VERSION,
      audioTracks:
        data.audioFileName && data.audioAssetKey
          ? [
              {
                id: "audio-1",
                fileName: data.audioFileName,
                assetKey: data.audioAssetKey,
                duration: data.audioDuration,
                offset: data.audioOffset,
                volume: data.audioVolume,
                muted: data.audioMuted ?? false,
                soloed: false,
              },
            ]
          : [],
    };
  }

  return data;
}

// Normalize saved legacy fields for conversion.
export function fromSavedProject(data: AnySavedProject) {
  // Version check: only reject if major breaking change
  if (data.version > STORAGE_VERSION) {
    console.warn("Project from newer version, some data may be lost");
  }

  const migrated = migrateSavedProject(data);

  // Merge with defaults (handles new fields gracefully)
  const merged = { ...DEFAULTS, ...migrated };
  const legacyWaveformHeight =
    migrated.waveformHeight ?? DEFAULT_WAVEFORM_HEIGHT;

  return {
    notes: merged.notes,
    tempo: merged.tempo,
    timeSignature: merged.timeSignature ?? DEFAULTS.timeSignature,
    keySignature: merged.keySignature ?? DEFAULTS.keySignature,
    gridSnap: merged.gridSnap,
    tabAnnotationEnabled:
      merged.tabAnnotationEnabled ?? DEFAULTS.tabAnnotationEnabled,
    tabOpenStringPitches:
      merged.tabOpenStringPitches ?? DEFAULTS.tabOpenStringPitches,
    locators: merged.locators ?? DEFAULTS.locators,
    audioTracks: merged.audioTracks.map((t) => ({
      ...t,
      soloed: t.soloed ?? false,
      waveformHeight: t.waveformHeight ?? legacyWaveformHeight,
    })),
    masterVolume: merged.masterVolume ?? DEFAULTS.masterVolume,
    midiVolume: merged.midiVolume,
    midiMuted: merged.midiMuted ?? DEFAULTS.midiMuted,
    midiSoloed: merged.midiSoloed ?? DEFAULTS.midiSoloed,
    midiProgram: merged.midiProgram ?? DEFAULTS.midiProgram,
    metronomeEnabled: merged.metronomeEnabled,
    metronomeVolume: merged.metronomeVolume,
    autoScrollEnabled: merged.autoScrollEnabled ?? DEFAULTS.autoScrollEnabled,
    linkAudioOffsetsEnabled:
      merged.linkAudioOffsetsEnabled ?? DEFAULTS.linkAudioOffsetsEnabled,
    scrollX: merged.scrollX ?? DEFAULTS.scrollX,
    scrollY: merged.scrollY ?? DEFAULTS.scrollY,
    pixelsPerBeat: merged.pixelsPerBeat ?? DEFAULTS.pixelsPerBeat,
    pixelsPerKey: merged.pixelsPerKey ?? DEFAULTS.pixelsPerKey,
  };
}
