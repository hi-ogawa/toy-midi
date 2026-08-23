import type { TimeSignature } from "../types";

export const DEFAULT_PIXELS_PER_BEAT = 80;
export const MIN_PIXELS_PER_BEAT = 1;
export const MAX_PIXELS_PER_BEAT = 400;

export const GRID_DIVISIONS = ["1/4", "1/8", "1/16", "1/32"] as const;
export type GridDivision = (typeof GRID_DIVISIONS)[number];
export const DEFAULT_GRID_DIVISION: GridDivision = "1/16";

export function secondsToBeats(seconds: number, tempo: number): number {
  return (seconds / 60) * tempo;
}

export function beatsToSeconds(beats: number, tempo: number): number {
  return (beats / tempo) * 60;
}

export function getBeatsPerBar(timeSignature: TimeSignature): number {
  const { numerator, denominator } = timeSignature;
  return numerator * (4 / denominator);
}

export function getSubdivisionsPerBeat(gridDivision: GridDivision): number {
  return Number(gridDivision.slice(2)) / 4;
}

export function formatBarBeat(bar: number, beat: number): string {
  return `${String(bar).padStart(2, "0")}|${String(beat).padStart(2, "0")}`;
}

export function formatBarBeatAtTime({
  seconds,
  tempo,
  timeSignature,
}: {
  seconds: number;
  tempo: number;
  timeSignature: TimeSignature;
}): string {
  const totalBeats = secondsToBeats(seconds, tempo);
  const { numerator, denominator } = timeSignature;
  const beatsPerBar = getBeatsPerBar(timeSignature);
  const bar = Math.floor(totalBeats / beatsPerBar) + 1;
  const beat = Math.min(
    numerator,
    Math.floor((totalBeats % beatsPerBar) / (4 / denominator)) + 1,
  );
  return formatBarBeat(bar, beat);
}

export function getVisibleBarInterval({
  barWidth,
  minimumPixelSpacing,
}: {
  barWidth: number;
  minimumPixelSpacing: number;
}): number {
  let bars = 1;
  while (bars * barWidth < minimumPixelSpacing) {
    bars *= 2;
  }
  return bars;
}
