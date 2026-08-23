import { createAudioView } from "../audio-view.ts";
import {
  RECORDER_WAVEFORM_POINTS_PER_SECOND,
  type RecorderProjectState,
  type RecorderRuntimeState,
} from "./runtime.ts";

export interface RecorderPcm {
  sampleRate: number;
  channels: Float32Array[];
}

export interface RecorderProjectAudioTrack {
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
}

export interface RecorderProjectTake {
  timelineOffset: number;
  pcm: RecorderPcm;
}

export interface RecorderProjectContent {
  title: string;
  audioTracks: RecorderProjectAudioTrack[];
  recordingTrack: {
    height: number;
    gain: number;
    muted: boolean;
    soloed: boolean;
    takes: RecorderProjectTake[];
  };
  latencyCompensation: number;
  tempo: number;
  timeSignature: {
    numerator: number;
    denominator: number;
  };
}

export function serializeRecorderProject(
  state: RecorderRuntimeState,
): RecorderProjectContent {
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
    })),
    recordingTrack: {
      height: state.recordingTrack.height,
      gain: state.recordingTrack.gain,
      muted: state.recordingTrack.muted,
      soloed: state.recordingTrack.soloed,
      takes: state.recordingTrack.takes.map((take) => {
        if (!take.buffer) {
          throw new Error("Recording take has no loaded buffer.");
        }
        return {
          timelineOffset: take.timelineOffset,
          pcm: serializeAudioBuffer(take.buffer),
        };
      }),
    },
    latencyCompensation: state.latencyCompensation,
    tempo: state.tempo,
    timeSignature: state.timeSignature,
  };
}

export function deserializeRecorderProject({
  context,
  project,
}: {
  context: AudioContext;
  project: RecorderProjectContent;
}): RecorderProjectState {
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
                  RECORDER_WAVEFORM_POINTS_PER_SECOND,
                ),
              }
            : undefined,
        gain: track.gain,
        muted: track.muted,
        soloed: track.soloed,
        timelineOffset: track.timelineOffset,
      };
    }),
    recordingTrack: {
      height: project.recordingTrack.height,
      gain: project.recordingTrack.gain,
      muted: project.recordingTrack.muted,
      soloed: project.recordingTrack.soloed,
      takes: project.recordingTrack.takes.map((take) => {
        const buffer = deserializeAudioBuffer(context, take.pcm);
        return {
          duration: buffer.duration,
          timelineOffset: take.timelineOffset,
          buffer,
          audioView: createAudioView(
            buffer.getChannelData(0),
            buffer.sampleRate,
            RECORDER_WAVEFORM_POINTS_PER_SECOND,
          ),
        };
      }),
    },
    latencyCompensation: project.latencyCompensation,
    tempo: project.tempo,
    timeSignature: project.timeSignature,
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
