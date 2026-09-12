import type { MultibandEqParameters } from "../dsp/biquad-eq-multiband.ts";
import {
  createDefaultEqBand,
  createDefaultMultibandEq,
} from "../dsp/biquad-eq-node.ts";
import type { EqParameters } from "../dsp/biquad-eq.ts";
import { createAudioClip } from "./audio-clip.ts";
import {
  migrateRecorderProject,
  type RecorderProjectInput,
} from "./project-migration.ts";
import {
  type PersistableRecorderRuntimeState,
  type RecorderLocator,
} from "./runtime.ts";

export interface SerializedRecorderRuntimeState {
  version: 2;
  title: string;
  locators?: RecorderLocator[];
  armedTrackId: string;
  audioTracks: {
    id: string;
    eq?: MultibandEqParameters | EqParameters;
    height: number;
    gain: number;
    muted: boolean;
    soloed: boolean;
    nextTakeNumber: number;
    clips: {
      id: string;
      name: string;
      muted: boolean;
      soloed: boolean;
      timelineOffset: number;
      trimStart?: number;
      trimEnd?: number;
      pcm: { sampleRate: number; channels: Float32Array[] };
    }[];
  }[];
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

export function serializeRecorderRuntimeState(
  state: PersistableRecorderRuntimeState,
): SerializedRecorderRuntimeState {
  return {
    version: 2,
    title: state.title,
    locators: state.locators,
    armedTrackId: state.armedTrackId,
    audioTracks: state.audioTracks.map((track) => ({
      id: track.id,
      height: track.height,
      eq: track.eq,
      gain: track.gain,
      muted: track.muted,
      soloed: track.soloed,
      nextTakeNumber: track.nextTakeNumber,
      clips: track.clips.map((clip) => {
        if (!clip.buffer) {
          throw new Error("Audio clip has no loaded buffer.");
        }
        return {
          id: clip.id,
          name: clip.name,
          muted: clip.muted,
          soloed: clip.soloed,
          timelineOffset: clip.timelineOffset,
          trimStart: clip.trimStart,
          trimEnd: clip.trimEnd,
          pcm: serializeAudioBuffer(clip.buffer),
        };
      }),
    })),
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
  project: input,
}: {
  context: Pick<AudioContext, "createBuffer">;
  project: RecorderProjectInput;
}): PersistableRecorderRuntimeState {
  const project = migrateRecorderProject(input);
  if (!project.audioTracks.some((track) => track.id === project.armedTrackId)) {
    throw new Error("Recorder project has no recording destination.");
  }
  return {
    title: project.title,
    locators: project.locators ?? [],
    armedTrackId: project.armedTrackId,
    audioTracks: project.audioTracks.map((track) => ({
      ...track,
      eq: deserializeEq(track.eq),
      clips: track.clips.map(({ pcm, ...clip }) => {
        const buffer = deserializeAudioBuffer(context, pcm);
        return {
          ...createAudioClip({
            id: clip.id,
            name: clip.name,
            buffer,
          }),
          timelineOffset: clip.timelineOffset,
          muted: clip.muted,
          soloed: clip.soloed,
          trimStart: clip.trimStart ?? 0,
          trimEnd: clip.trimEnd ?? buffer.duration,
        };
      }),
    })),
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

function serializeAudioBuffer(buffer: AudioBuffer): {
  sampleRate: number;
  channels: Float32Array[];
} {
  return {
    sampleRate: buffer.sampleRate,
    channels: Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
      buffer.getChannelData(channel).slice(),
    ),
  };
}

function deserializeAudioBuffer(
  context: Pick<AudioContext, "createBuffer">,
  pcm: { sampleRate: number; channels: Float32Array[] },
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
