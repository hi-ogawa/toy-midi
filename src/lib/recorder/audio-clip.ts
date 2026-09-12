import type { AudioView } from "../audio-view.ts";

export interface AudioClip {
  id: string;
  number?: number;
  name?: string;
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
