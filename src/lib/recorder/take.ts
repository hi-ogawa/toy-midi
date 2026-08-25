import type { AudioView } from "../audio-view.ts";

export interface TakeState {
  id: string;
  number: number;
  duration: number;
  timelineOffset: number;
  buffer?: AudioBuffer;
  audioView?: AudioView;
}

export interface TakeRegion {
  takeId: string;
  timelineOffset: number;
  duration: number;
}
