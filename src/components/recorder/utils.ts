import { gainToDb } from "../../lib/music";

export const BEATS_PER_BAR = 4;
export const DEFAULT_PIXELS_PER_BEAT = 80;
export const MIN_PIXELS_PER_BEAT = 20;
export const MAX_PIXELS_PER_BEAT = 320;

export function recorderSecondsToBeats(seconds: number, tempo: number): number {
  return (seconds / 60) * tempo;
}

export function recorderBeatsToSeconds(beats: number, tempo: number): number {
  return (beats / tempo) * 60;
}

export function formatBarBeat(seconds: number, tempo: number): string {
  const totalBeats = recorderSecondsToBeats(seconds, tempo);
  const bar = Math.floor(totalBeats / BEATS_PER_BAR) + 1;
  const beat = Math.floor(totalBeats % BEATS_PER_BAR) + 1;
  return `${String(bar).padStart(2, "0")}|${String(beat).padStart(2, "0")}`;
}

export function formatDb(gain: number): string {
  if (gain === 0) {
    return "-∞ dB";
  }
  const db = gainToDb(gain);
  return `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`;
}

export function formatLatencyMilliseconds(value: number): string {
  return value.toFixed(1);
}
