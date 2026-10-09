import { createAudioView, type AudioView } from "../audio-view.ts";

export interface AudioClip {
  id: string;
  name: string;
  /** Linear gain */
  gain: number;
  muted: boolean;
  soloed: boolean;
  /** Source buffer length in seconds */
  duration: number;
  /** Audible source-buffer interval [trimStart, trimEnd), in seconds. */
  trimStart: number;
  trimEnd: number;
  /** Timeline position of the source buffer's start, in seconds */
  timelineOffset: number;
  buffer?: AudioBuffer;
  audioView?: AudioView;
}

/** The part of a clip that is heard on the timeline, in seconds */
export interface ClipRegion {
  clip: AudioClip;
  timelineStart: number;
  timelineEnd: number;
}

export const WAVEFORM_POINTS_PER_SECOND = 800;

export function createAudioClip({
  buffer,
  name,
  id = crypto.randomUUID(),
}: {
  buffer: AudioBuffer;
  name: string;
  id?: string;
}): AudioClip {
  return {
    id,
    name,
    gain: 1,
    muted: false,
    soloed: false,
    timelineOffset: 0,
    trimStart: 0,
    trimEnd: buffer.duration,
    duration: buffer.duration,
    buffer,
    audioView: createAudioView(
      buffer.getChannelData(0),
      buffer.sampleRate,
      WAVEFORM_POINTS_PER_SECOND,
    ),
  };
}
