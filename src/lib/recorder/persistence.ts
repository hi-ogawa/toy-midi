import { createAudioView } from "../audio-view.ts";
import { createDefaultEq } from "../dsp/biquad-eq-node.ts";
import type { EqParameters } from "../dsp/biquad-eq.ts";
import {
  WAVEFORM_POINTS_PER_SECOND,
  type PersistableRecorderRuntimeState,
  type RecorderRuntimeState,
  type RecorderLocator,
} from "./runtime.ts";

export interface SerializedRecorderRuntimeState {
  title: string;
  // Optional for recorder projects saved before locator support.
  locators?: RecorderLocator[];
  audioTracks: SerializedAudioTrackState[];
  recordingTrack: {
    // Optional for projects saved before track EQ support.
    eq?: EqParameters;
    height: number;
    gain: number;
    muted: boolean;
    soloed: boolean;
    takes: SerializedTakeState[];
    // Optional for recorder projects saved before multi-take support.
    nextTakeNumber?: number;
  };
  latencyCompensation: number;
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

interface SerializedAudioTrackState {
  // Optional for projects saved before track EQ support.
  eq?: EqParameters;
  id: string;
  height: number;
  clip?: {
    name: string;
    pcm: RecorderPcm;
  };
  gain: number;
  muted: boolean;
  soloed: boolean;
  timelineOffset: number;
  // optional for back compat
  trimStart?: number;
  trimEnd?: number;
}

interface SerializedTakeState {
  // Optional for recorder projects saved before multi-take support.
  id?: string;
  number?: number;
  muted?: boolean;
  soloed?: boolean;
  timelineOffset: number;
  trimStart?: number;
  trimEnd?: number;
  pcm: RecorderPcm;
}

interface RecorderPcm {
  sampleRate: number;
  channels: Float32Array[];
}

export function serializeRecorderRuntimeState(
  state: RecorderRuntimeState,
): SerializedRecorderRuntimeState {
  return {
    title: state.title,
    locators: state.locators,
    audioTracks: state.audioTracks.map((track) => {
      const clip = track.clips[0];
      return {
        id: track.id,
        height: track.height,
        eq: track.eq,
        gain: track.gain,
        muted: track.muted,
        soloed: track.soloed,
        clip: clip?.buffer
          ? {
              name: clip.name ?? "Audio",
              pcm: serializeAudioBuffer(clip.buffer),
            }
          : undefined,
        timelineOffset: clip?.timelineOffset ?? 0,
        trimStart: clip?.trimStart ?? 0,
        trimEnd: clip?.trimEnd ?? 0,
      };
    }),
    recordingTrack: {
      height: state.recordingTrack.height,
      eq: state.recordingTrack.eq,
      gain: state.recordingTrack.gain,
      muted: state.recordingTrack.muted,
      soloed: state.recordingTrack.soloed,
      nextTakeNumber: state.recordingTrack.nextTakeNumber,
      takes: state.recordingTrack.clips.map((take) => {
        if (!take.buffer) {
          throw new Error("Recording take has no loaded buffer.");
        }
        return {
          id: take.id,
          number: take.number,
          muted: take.muted,
          soloed: take.soloed,
          timelineOffset: take.timelineOffset,
          trimStart: take.trimStart,
          trimEnd: take.trimEnd,
          pcm: serializeAudioBuffer(take.buffer),
        };
      }),
    },
    latencyCompensation: state.latencyCompensation,
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
    audioTracks: project.audioTracks.map((track) => {
      const buffer = track.clip
        ? deserializeAudioBuffer(context, track.clip.pcm)
        : undefined;
      return {
        id: track.id,
        height: track.height,
        clips:
          track.clip && buffer
            ? [
                {
                  id: crypto.randomUUID(),
                  name: track.clip.name,
                  muted: false,
                  soloed: false,
                  timelineOffset: track.timelineOffset,
                  trimStart: track.trimStart ?? 0,
                  trimEnd: track.trimEnd ?? buffer.duration,
                  duration: buffer.duration,
                  buffer,
                  audioView: createAudioView(
                    buffer.getChannelData(0),
                    buffer.sampleRate,
                    WAVEFORM_POINTS_PER_SECOND,
                  ),
                },
              ]
            : [],
        eq: track.eq ?? createDefaultEq(),
        gain: track.gain,
        muted: track.muted,
        soloed: track.soloed,
      };
    }),
    recordingTrack: {
      height: project.recordingTrack.height,
      eq: project.recordingTrack.eq ?? createDefaultEq(),
      gain: project.recordingTrack.gain,
      muted: project.recordingTrack.muted,
      soloed: project.recordingTrack.soloed,
      nextTakeNumber:
        project.recordingTrack.nextTakeNumber ??
        project.recordingTrack.takes.length + 1,
      clips: project.recordingTrack.takes.map((take, index) => {
        const buffer = deserializeAudioBuffer(context, take.pcm);
        return {
          id: take.id ?? crypto.randomUUID(),
          number: take.number ?? index + 1,
          muted: take.muted ?? false,
          soloed: take.soloed ?? false,
          duration: buffer.duration,
          timelineOffset: take.timelineOffset,
          trimStart: take.trimStart ?? 0,
          trimEnd: take.trimEnd ?? buffer.duration,
          buffer,
          audioView: createAudioView(
            buffer.getChannelData(0),
            buffer.sampleRate,
            WAVEFORM_POINTS_PER_SECOND,
          ),
        };
      }),
    },
    latencyCompensation: project.latencyCompensation,
    masterGain: project.masterGain ?? 1,
    metronomeGain: project.metronomeGain ?? 0.5,
    loop: project.loop ?? { enabled: false },
    punch: project.punch ?? { enabled: false },
    tempo: project.tempo,
    timeSignature: project.timeSignature,
    referenceVideo: project.referenceVideo,
  };
}

function serializeAudioBuffer(buffer: AudioBuffer): RecorderPcm {
  return {
    sampleRate: buffer.sampleRate,
    channels: Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
      buffer.getChannelData(channel).slice(),
    ),
  };
}

function deserializeAudioBuffer(
  context: AudioContext,
  pcm: RecorderPcm,
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
