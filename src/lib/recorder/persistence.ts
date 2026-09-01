import { createAudioView } from "../audio-view.ts";
import {
  WAVEFORM_POINTS_PER_SECOND,
  type PersistableRecorderRuntimeState,
  type RecorderRuntimeState,
} from "./runtime.ts";

export interface SerializedRecorderRuntimeState {
  title: string;
  audioTracks: SerializedAudioTrackState[];
  recordingTrack: {
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
  loopRange?: {
    startBeat: number;
    endBeat: number;
  };
  loopEnabled?: boolean;
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
    audioTracks: state.audioTracks.map((track) => ({
      id: track.id,
      height: track.height,
      clip: track.clip
        ? {
            name: track.clip.name,
            pcm: serializeAudioBuffer(track.clip.buffer),
          }
        : undefined,
      gain: track.gain,
      muted: track.muted,
      soloed: track.soloed,
      timelineOffset: track.timelineOffset,
      trimStart: track.trimStart,
      trimEnd: track.trimEnd,
    })),
    recordingTrack: {
      height: state.recordingTrack.height,
      gain: state.recordingTrack.gain,
      muted: state.recordingTrack.muted,
      soloed: state.recordingTrack.soloed,
      nextTakeNumber: state.recordingTrack.nextTakeNumber,
      takes: state.recordingTrack.takes.map((take) => {
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
    loopRange: state.loopRange,
    loopEnabled: state.loopEnabled,
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
    audioTracks: project.audioTracks.map((track) => {
      const buffer = track.clip
        ? deserializeAudioBuffer(context, track.clip.pcm)
        : undefined;
      return {
        id: track.id,
        height: track.height,
        clip:
          track.clip && buffer
            ? {
                name: track.clip.name,
                buffer,
                audioView: createAudioView(
                  buffer.getChannelData(0),
                  buffer.sampleRate,
                  WAVEFORM_POINTS_PER_SECOND,
                ),
              }
            : undefined,
        gain: track.gain,
        muted: track.muted,
        soloed: track.soloed,
        timelineOffset: track.timelineOffset,
        trimStart: track.trimStart ?? 0,
        trimEnd: track.trimEnd ?? buffer?.duration ?? 0,
      };
    }),
    recordingTrack: {
      height: project.recordingTrack.height,
      gain: project.recordingTrack.gain,
      muted: project.recordingTrack.muted,
      soloed: project.recordingTrack.soloed,
      nextTakeNumber:
        project.recordingTrack.nextTakeNumber ??
        project.recordingTrack.takes.length + 1,
      takes: project.recordingTrack.takes.map((take, index) => {
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
    loopRange: project.loopRange,
    loopEnabled: project.loopEnabled ?? false,
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
