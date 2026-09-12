import type { EqParameters } from "../dsp/biquad-eq.ts";
import type { SerializedRecorderRuntimeState } from "./persistence.ts";
import type { RecorderLocator } from "./runtime.ts";

export type RecorderProjectInput<Channel = Float32Array> =
  | SerializedRecorderRuntimeState<Channel>
  | LegacyRecorderProject<Channel>;

/** Normalize project structure before decoding PCM, including channel paths in old archives. */
export function migrateRecorderProject<Channel>(
  project: RecorderProjectInput<Channel>,
): SerializedRecorderRuntimeState<Channel> {
  if ("version" in project) {
    if (project.version !== 2) {
      throw new Error("Recorder project requires a newer app version.");
    }
    return project;
  }
  const { audioTracks, recordingTrack, ...settings } = project;
  const armedTrackId = crypto.randomUUID();
  return {
    ...settings,
    version: 2,
    armedTrackId,
    audioTracks: [
      ...audioTracks.map(
        ({ clip, timelineOffset, trimStart, trimEnd, ...track }) => ({
          ...track,
          nextTakeNumber: 1,
          clips: clip
            ? [
                {
                  id: crypto.randomUUID(),
                  name: clip.name,
                  pcm: clip.pcm,
                  timelineOffset,
                  trimStart,
                  trimEnd,
                  muted: false,
                  soloed: false,
                },
              ]
            : [],
        }),
      ),
      {
        id: armedTrackId,
        eq: recordingTrack.eq,
        height: recordingTrack.height,
        gain: recordingTrack.gain,
        muted: recordingTrack.muted,
        soloed: recordingTrack.soloed,
        nextTakeNumber:
          recordingTrack.nextTakeNumber ?? recordingTrack.takes.length + 1,
        clips: recordingTrack.takes.map((take, index) => ({
          ...take,
          id: take.id ?? crypto.randomUUID(),
          number: take.number ?? index + 1,
          muted: take.muted ?? false,
          soloed: take.soloed ?? false,
        })),
      },
    ],
  };
}

interface LegacyRecorderProject<Channel> {
  title: string;
  // Optional for recorder projects saved before locator support.
  locators?: RecorderLocator[];
  audioTracks: SerializedAudioTrackState<Channel>[];
  recordingTrack: {
    // Optional for projects saved before track EQ support.
    eq?: EqParameters;
    height: number;
    gain: number;
    muted: boolean;
    soloed: boolean;
    takes: SerializedTakeState<Channel>[];
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

interface SerializedAudioTrackState<Channel> {
  // Optional for projects saved before track EQ support.
  eq?: EqParameters;
  id: string;
  height: number;
  clip?: {
    name: string;
    pcm: RecorderPcm<Channel>;
  };
  gain: number;
  muted: boolean;
  soloed: boolean;
  timelineOffset: number;
  // optional for back compat
  trimStart?: number;
  trimEnd?: number;
}

interface SerializedTakeState<Channel> {
  // Optional for recorder projects saved before multi-take support.
  id?: string;
  number?: number;
  muted?: boolean;
  soloed?: boolean;
  timelineOffset: number;
  trimStart?: number;
  trimEnd?: number;
  pcm: RecorderPcm<Channel>;
}

interface RecorderPcm<Channel> {
  sampleRate: number;
  channels: Channel[];
}
