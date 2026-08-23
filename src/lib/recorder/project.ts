export const RECORDER_PROJECT_VERSION = 1;

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
  version: typeof RECORDER_PROJECT_VERSION;
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

export interface SavedRecorderProject extends RecorderProjectContent {
  id: string;
  updatedAt: number;
}

export function serializeAudioBuffer(buffer: AudioBuffer): RecorderPcm {
  return {
    sampleRate: buffer.sampleRate,
    channels: Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
      buffer.getChannelData(channel).slice(),
    ),
  };
}

export function deserializeAudioBuffer(
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
