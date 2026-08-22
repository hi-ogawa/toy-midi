export function secondsToBeats(seconds: number, tempo: number): number {
  return (seconds / 60) * tempo;
}

export function beatsToSeconds(beats: number, tempo: number): number {
  return (beats / tempo) * 60;
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
