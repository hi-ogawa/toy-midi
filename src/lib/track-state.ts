import { createDefaultMultibandEq } from "./dsp/biquad-eq-multiband.ts";
import { clamp } from "./music.ts";
import { DEFAULT_KEY_SIGNATURE } from "./pitch-spelling.ts";
import type { AudioTrackState, MidiPreset, MidiTrackState } from "./runtime.ts";
import { DEFAULT_TAB_OPEN_STRING_PITCHES } from "./tab-annotation.ts";

// Fits the track header with its gain slider row below the title row.
export const MIN_GAIN_SLIDER_HEIGHT = 72;
// New tracks open with the gain slider showing.
const DEFAULT_TRACK_HEIGHT = MIN_GAIN_SLIDER_HEIGHT;
// Fits the compact track header, which is a single title row.
export const MIN_TRACK_HEIGHT = 44;
const MAX_TRACK_HEIGHT = 300;
// Tall enough for several octaves of piano roll.
export const MAX_MIDI_TRACK_HEIGHT = 800;

export function createAudioTrackState({
  name,
}: {
  name: string;
}): AudioTrackState {
  return {
    eq: createDefaultMultibandEq(),
    id: crypto.randomUUID(),
    name,
    nextTakeNumber: 1,
    showClips: false,
    height: DEFAULT_TRACK_HEIGHT,
    gain: 1,
    pan: 0,
    reverbSend: 0,
    muted: false,
    soloed: false,
    clips: [],
    regions: [],
  };
}

export function createMidiTrackState({
  name,
  preset,
}: {
  name: string;
  preset: MidiPreset;
}): MidiTrackState {
  return {
    id: crypto.randomUUID(),
    name,
    notes: [],
    automation: [],
    ...preset,
    eq: createDefaultMultibandEq(),
    height: 300,
    viewMode: "editor",
    gain: 1,
    pan: 0,
    reverbSend: 0,
    muted: false,
    soloed: false,
    tabAnnotationEnabled: false,
    tabOpenStringPitches: [...DEFAULT_TAB_OPEN_STRING_PITCHES],
    keySignature: { ...DEFAULT_KEY_SIGNATURE },
  };
}

export function clampTrackHeight(height: number): number {
  return clamp(height, MIN_TRACK_HEIGHT, MAX_TRACK_HEIGHT);
}
