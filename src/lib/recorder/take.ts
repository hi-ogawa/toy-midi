import type { AudioView } from "../audio-view.ts";

export interface TakeState {
  id: string;
  number: number;
  includedInComp: boolean;
  duration: number;
  /** Audible source-buffer interval [trimStart, trimEnd), in seconds. */
  trimStart: number;
  trimEnd: number;
  timelineOffset: number;
  buffer?: AudioBuffer;
  audioView?: AudioView;
}

export interface TakeRegion {
  take: TakeState;
  timelineStart: number;
  timelineEnd: number;
}
