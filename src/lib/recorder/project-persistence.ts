import { createAudioView } from "../audio-view.ts";
import type { RecorderProjectState, RecorderRuntimeState } from "./runtime.ts";

const WAVEFORM_POINTS_PER_SECOND = 800;

export interface RecorderPcm {
  sampleRate: number;
  channels: Float32Array[];
}

export interface RecorderProjectAudioTrack {
  id: string;
  height: number;
  name: string;
  gain: number;
  muted: boolean;
  soloed: boolean;
  timelineOffset: number;
  pcm: RecorderPcm;
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
    audioTracks: state.audioTracks.map((track) => {
      if (!track.clip) {
        throw new Error(`Audio track ${track.id} has no loaded buffer.`);
      }
      return {
        id: track.id,
        height: track.height,
        name: track.clip.name,
        gain: track.gain,
        muted: track.muted,
        soloed: track.soloed,
        timelineOffset: track.timelineOffset,
        pcm: serializeAudioBuffer(track.clip.buffer),
      };
    }),
    recordingTrack: {
      height: state.recordingTrack.height,
      gain: state.recordingTrack.gain,
      muted: state.recordingTrack.muted,
      soloed: state.recordingTrack.soloed,
      takes: state.recordingTrack.takes.map((take, index) => {
        if (index !== 0) {
          throw new Error("Multiple persisted takes are not supported yet.");
        }
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
  if (project.recordingTrack.takes.length > 1) {
    throw new Error("Multiple persisted takes are not supported yet.");
  }
  const take = project.recordingTrack.takes[0];
  const takeBuffer = take
    ? deserializeAudioBuffer(context, take.pcm)
    : undefined;
  return {
    title: project.title,
    audioTracks: project.audioTracks.map((track) => {
      const buffer = deserializeAudioBuffer(context, track.pcm);
      return {
        id: track.id,
        height: track.height,
        clip: {
          name: track.name,
          buffer,
          audioView: createAudioView(
            buffer.getChannelData(0),
            buffer.sampleRate,
            WAVEFORM_POINTS_PER_SECOND,
          ),
        },
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
      takes: takeBuffer
        ? [
            {
              duration: takeBuffer.duration,
              timelineOffset: take!.timelineOffset,
              buffer: takeBuffer,
              audioView: createAudioView(
                takeBuffer.getChannelData(0),
                takeBuffer.sampleRate,
                WAVEFORM_POINTS_PER_SECOND,
              ),
            },
          ]
        : [],
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
