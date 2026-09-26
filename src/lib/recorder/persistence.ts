import type { MultibandEqParameters } from "../dsp/biquad-eq-multiband.ts";
import {
  createDefaultEqBand,
  createDefaultMultibandEq,
} from "../dsp/biquad-eq-node.ts";
import type { EqParameters } from "../dsp/biquad-eq.ts";
import { DEFAULT_KEY_SIGNATURE } from "../pitch-spelling.ts";
import { DEFAULT_TAB_OPEN_STRING_PITCHES } from "../tab-annotation.ts";
import { type AudioClip, createAudioClip } from "./audio-clip.ts";
import {
  type PersistableRecorderRuntimeState,
  type RecorderLocator,
  type MidiTrackState,
} from "./runtime.ts";

/**
 * @typeParam ChannelData - PCM samples (`Float32Array`) by default, or a ZIP entry
 * path (`string`) in project archives.
 */
export interface SerializedRecorderRuntimeState<ChannelData = Float32Array> {
  title: string;
  // Optional for recorder projects saved before locator support.
  locators?: RecorderLocator[];
  audioTracks: SerializedAudioTrackState<ChannelData>[];
  // Optional for recorder projects saved before MIDI track support.
  midiTracks?: (Omit<
    MidiTrackState,
    | "tabAnnotationEnabled"
    | "tabOpenStringPitches"
    | "keySignature"
    | "viewMode"
  > & {
    tabAnnotationEnabled?: boolean;
    tabOpenStringPitches?: number[];
    keySignature?: MidiTrackState["keySignature"];
    viewMode?: MidiTrackState["viewMode"];
  })[];
  recordingTrack: {
    // Optional for projects saved before track EQ support.
    eq?: MultibandEqParameters | EqParameters;
    height: number;
    gain: number;
    muted: boolean;
    soloed: boolean;
    takes: SerializedAudioClip<ChannelData>[];
    // Optional for recorder projects saved before multi-take support.
    nextTakeNumber?: number;
  };
  // Optional for recorder projects saved before mixer support.
  masterGain?: number;
  metronomeGain?: number;
  loop?: {
    range?: {
      startBeat: number;
      endBeat: number;
    };
    enabled: boolean;
  };
  punch?: {
    range?: {
      startBeat: number;
      endBeat: number;
    };
    enabled: boolean;
  };
  tempo: number;
  timeSignature: {
    numerator: number;
    denominator: number;
  };
  referenceVideo?: {
    videoId: string;
    timelineStart: number;
    muted: boolean;
    title?: string;
    duration: number;
  };
}

interface SerializedAudioTrackState<ChannelData> {
  // Optional for projects saved before track EQ support.
  eq?: MultibandEqParameters | EqParameters;
  id: string;
  height: number;
  gain: number;
  muted: boolean;
  soloed: boolean;
  // Optional for projects saved with a single clip per track.
  clips?: SerializedAudioClip<ChannelData>[];
  // Retained for tracks saved with a single clip and track-level timing.
  clip?: {
    name: string;
    gain?: number;
    pcm: RecorderPcm<ChannelData>;
  };
  timelineOffset?: number;
  trimStart?: number;
  trimEnd?: number;
}

interface SerializedAudioClip<ChannelData> {
  // Optional for recorder projects saved before multi-take support.
  id?: string;
  number?: number;
  name?: string;
  gain?: number;
  muted?: boolean;
  soloed?: boolean;
  timelineOffset: number;
  trimStart?: number;
  trimEnd?: number;
  pcm: RecorderPcm<ChannelData>;
}

export interface RecorderPcm<ChannelData> {
  sampleRate: number;
  channels: ChannelData[];
}

export function serializeRecorderRuntimeState(
  state: PersistableRecorderRuntimeState,
): SerializedRecorderRuntimeState {
  return {
    title: state.title,
    locators: state.locators,
    audioTracks: state.audioTracks.map((track) => ({
      id: track.id,
      height: track.height,
      eq: track.eq,
      gain: track.gain,
      muted: track.muted,
      soloed: track.soloed,
      clips: track.clips.map(serializeAudioClip),
    })),
    midiTracks: state.midiTracks,
    recordingTrack: {
      height: state.recordingTrack.height,
      eq: state.recordingTrack.eq,
      gain: state.recordingTrack.gain,
      muted: state.recordingTrack.muted,
      soloed: state.recordingTrack.soloed,
      nextTakeNumber: state.recordingTrack.nextTakeNumber,
      takes: state.recordingTrack.clips.map(serializeAudioClip),
    },
    masterGain: state.masterGain,
    metronomeGain: state.metronomeGain,
    loop: state.loop,
    punch: state.punch,
    tempo: state.tempo,
    timeSignature: state.timeSignature,
    referenceVideo: state.referenceVideo,
  };
}

export function deserializeRecorderRuntimeState({
  context,
  project,
}: {
  context: AudioContext;
  project: SerializedRecorderRuntimeState;
}): PersistableRecorderRuntimeState {
  return {
    title: project.title,
    locators: project.locators ?? [],
    audioTracks: project.audioTracks.map((track) => ({
      id: track.id,
      nextTakeNumber: 1,
      height: track.height,
      clips: (track.clips ?? deserializeSingleClip(track)).map((clip, index) =>
        deserializeAudioClip({ context, clip, index }),
      ),
      eq: deserializeEq(track.eq),
      gain: track.gain,
      muted: track.muted,
      soloed: track.soloed,
    })),
    midiTracks: (project.midiTracks ?? []).map((track) => ({
      ...track,
      viewMode: track.viewMode ?? "editor",
      tabAnnotationEnabled: track.tabAnnotationEnabled ?? false,
      tabOpenStringPitches: track.tabOpenStringPitches ?? [
        ...DEFAULT_TAB_OPEN_STRING_PITCHES,
      ],
      keySignature: track.keySignature ?? { ...DEFAULT_KEY_SIGNATURE },
      eq: deserializeEq(track.eq),
    })),
    recordingTrack: {
      id: crypto.randomUUID(),
      height: project.recordingTrack.height,
      eq: deserializeEq(project.recordingTrack.eq),
      gain: project.recordingTrack.gain,
      muted: project.recordingTrack.muted,
      soloed: project.recordingTrack.soloed,
      nextTakeNumber:
        project.recordingTrack.nextTakeNumber ??
        project.recordingTrack.takes.length + 1,
      clips: project.recordingTrack.takes.map((clip, index) =>
        deserializeAudioClip({ context, clip, index }),
      ),
    },
    masterGain: project.masterGain ?? 1,
    metronomeGain: project.metronomeGain ?? 0.5,
    loop: project.loop ?? { enabled: false },
    punch: project.punch ?? { enabled: false },
    tempo: project.tempo,
    timeSignature: project.timeSignature,
    referenceVideo: project.referenceVideo,
  };
}

function serializeAudioClip(
  clip: AudioClip,
): SerializedAudioClip<Float32Array> {
  if (!clip.buffer) {
    throw new Error("Audio clip has no loaded buffer.");
  }
  return {
    id: clip.id,
    name: clip.name,
    gain: clip.gain,
    muted: clip.muted,
    soloed: clip.soloed,
    timelineOffset: clip.timelineOffset,
    trimStart: clip.trimStart,
    trimEnd: clip.trimEnd,
    pcm: serializeAudioBuffer(clip.buffer),
  };
}

function deserializeSingleClip(
  track: SerializedAudioTrackState<Float32Array>,
): SerializedAudioClip<Float32Array>[] {
  if (!track.clip) {
    return [];
  }
  return [
    {
      ...track.clip,
      timelineOffset: track.timelineOffset ?? 0,
      trimStart: track.trimStart,
      trimEnd: track.trimEnd,
    },
  ];
}

function deserializeAudioClip({
  context,
  clip,
  index,
}: {
  context: AudioContext;
  clip: SerializedAudioClip<Float32Array>;
  index: number;
}): AudioClip {
  const buffer = deserializeAudioBuffer(context, clip.pcm);
  return {
    ...createAudioClip({
      id: clip.id,
      buffer,
      name: clip.name ?? `Take ${clip.number ?? index + 1}`,
    }),
    timelineOffset: clip.timelineOffset,
    gain: clip.gain ?? 1,
    muted: clip.muted ?? false,
    soloed: clip.soloed ?? false,
    trimStart: clip.trimStart ?? 0,
    trimEnd: clip.trimEnd ?? buffer.duration,
  };
}

function deserializeEq(
  eq?: MultibandEqParameters | EqParameters,
): MultibandEqParameters {
  if (!eq) {
    return createDefaultMultibandEq();
  }
  if ("bands" in eq) {
    return eq;
  }
  return {
    bypass: false,
    bands: [{ ...createDefaultEqBand(), ...eq }],
  };
}

function serializeAudioBuffer(buffer: AudioBuffer): RecorderPcm<Float32Array> {
  return {
    sampleRate: buffer.sampleRate,
    channels: Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
      buffer.getChannelData(channel).slice(),
    ),
  };
}

function deserializeAudioBuffer(
  context: AudioContext,
  pcm: RecorderPcm<Float32Array>,
): AudioBuffer {
  if (!Number.isFinite(pcm.sampleRate) || pcm.sampleRate <= 0) {
    throw new Error("Recorder audio has an invalid sample rate.");
  }
  const length = pcm.channels[0]?.length;
  if (
    length === undefined ||
    pcm.channels.some((channel) => channel.length !== length)
  ) {
    throw new Error("Recorder audio channels have inconsistent lengths.");
  }
  const buffer = context.createBuffer(
    pcm.channels.length,
    length,
    pcm.sampleRate,
  );
  for (const [channel, samples] of pcm.channels.entries()) {
    buffer.getChannelData(channel).set(samples);
  }
  return buffer;
}
