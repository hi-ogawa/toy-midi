import { createAudioView, type AudioView } from "../audio-view.ts";

export interface AudioClip {
  id: string;
  name: string;
  muted: boolean;
  soloed: boolean;
  duration: number;
  /** Audible source-buffer interval [trimStart, trimEnd), in seconds. */
  trimStart: number;
  trimEnd: number;
  timelineOffset: number;
  buffer?: AudioBuffer;
  audioView?: AudioView;
}

export interface ClipRegion {
  clip: AudioClip;
  timelineStart: number;
  timelineEnd: number;
}

export const WAVEFORM_POINTS_PER_SECOND = 800;

export function createAudioClip({
  buffer,
  name,
  timelineOffset = 0,
  id = crypto.randomUUID(),
}: {
  buffer: AudioBuffer;
  name: string;
  timelineOffset?: number;
  id?: string;
}): AudioClip {
  return {
    id,
    name,
    muted: false,
    soloed: false,
    timelineOffset,
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
