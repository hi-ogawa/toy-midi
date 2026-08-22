import { gainToDb } from "../../lib/music";

export const BEATS_PER_BAR = 4;
export const DEFAULT_PIXELS_PER_BEAT = 80;
export const MIN_PIXELS_PER_BEAT = 1;
export const MAX_PIXELS_PER_BEAT = 400;

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

export function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remaining
    .toFixed(3)
    .padStart(6, "0")}`;
}

export function getRecorderRulerLabelEveryBars(pixelsPerBeat: number): number {
  const minimumLabelSpacing = 48;
  let bars = 1;
  while (bars * BEATS_PER_BAR * pixelsPerBeat < minimumLabelSpacing) {
    bars *= 2;
  }
  return bars;
}
