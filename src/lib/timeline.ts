import type { TimeSignature } from "../types";

export const MIN_PIXELS_PER_BEAT = 1;
export const MAX_PIXELS_PER_BEAT = 400;

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

export function formatBarBeat(bar: number, beat: number): string {
  return `${String(bar).padStart(2, "0")}|${String(beat).padStart(2, "0")}`;
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
