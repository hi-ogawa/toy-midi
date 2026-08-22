export function secondsToBeats(seconds: number, tempo: number): number {
  return (seconds / 60) * tempo;
}

export function beatsToSeconds(beats: number, tempo: number): number {
  return (beats / tempo) * 60;
}

export function getCoarseInterval({
  baseInterval,
  minimumSpacing,
  pixelsPerUnit,
}: {
  baseInterval: number;
  minimumSpacing: number;
  pixelsPerUnit: number;
}): number {
  let interval = baseInterval;
  while (interval * pixelsPerUnit < minimumSpacing) {
    interval *= 2;
  }
  return interval;
}
