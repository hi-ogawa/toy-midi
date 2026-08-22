export function secondsToBeats(seconds: number, tempo: number): number {
  return (seconds / 60) * tempo;
}

export function beatsToSeconds(beats: number, tempo: number): number {
  return (beats / tempo) * 60;
}

export function getVisibleTimelineInterval({
  beatsPerBar,
  beatWidth,
  minimumPixelSpacing,
}: {
  beatsPerBar: number;
  beatWidth: number;
  minimumPixelSpacing: number;
}): number {
  let interval = beatsPerBar;
  while (interval * beatWidth < minimumPixelSpacing) {
    interval *= 2;
  }
  return interval;
}
