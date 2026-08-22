import { gainToDb } from "../../lib/music";

export const DEFAULT_PIXELS_PER_BEAT = 80;
export const MIN_PIXELS_PER_BEAT = 1;
export const MAX_PIXELS_PER_BEAT = 400;

export const RECORDER_TIME_SIGNATURES = ["3/4", "4/4", "6/8"] as const;
export const RECORDER_GRID_DIVISIONS = ["1/4", "1/8", "1/16", "1/32"] as const;

export type RecorderTimeSignature = (typeof RECORDER_TIME_SIGNATURES)[number];
export type RecorderGridDivision = (typeof RECORDER_GRID_DIVISIONS)[number];

export function getRecorderBeatsPerBar(
  timeSignature: RecorderTimeSignature,
): number {
  const [numerator, denominator] = timeSignature.split("/").map(Number);
  return numerator * (4 / denominator);
}

export function getRecorderSubdivisionsPerBeat(
  gridDivision: RecorderGridDivision,
): number {
  return Number(gridDivision.slice(2)) / 4;
}

export function recorderSecondsToBeats(seconds: number, tempo: number): number {
  return (seconds / 60) * tempo;
}

export function recorderBeatsToSeconds(beats: number, tempo: number): number {
  return (beats / tempo) * 60;
}

export function formatBarBeat(
  seconds: number,
  tempo: number,
  timeSignature: RecorderTimeSignature,
): string {
  const totalBeats = recorderSecondsToBeats(seconds, tempo);
  const [numerator, denominator] = timeSignature.split("/").map(Number);
  const beatsPerBar = getRecorderBeatsPerBar(timeSignature);
  const bar = Math.floor(totalBeats / beatsPerBar) + 1;
  const beat = Math.min(
    numerator,
    Math.floor((totalBeats % beatsPerBar) / (4 / denominator)) + 1,
  );
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

export function getRecorderRulerLabelEveryBars({
  beatsPerBar,
  pixelsPerBeat,
}: {
  beatsPerBar: number;
  pixelsPerBeat: number;
}): number {
  const minimumLabelSpacing = 48;
  let bars = 1;
  while (bars * beatsPerBar * pixelsPerBeat < minimumLabelSpacing) {
    bars *= 2;
  }
  return bars;
}
