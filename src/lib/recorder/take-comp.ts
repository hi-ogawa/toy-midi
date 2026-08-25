import type { TakeRange, TakeRegion } from "./take-regions.ts";

interface TakeWithBuffer extends TakeRange {
  buffer?: AudioBuffer;
}

export function renderTakeComp({
  context,
  regions,
  takes,
}: {
  context: BaseAudioContext;
  regions: readonly TakeRegion[];
  takes: readonly TakeWithBuffer[];
}): AudioBuffer | undefined {
  if (regions.length === 0) {
    return undefined;
  }
  const timelineOffset = Math.min(0, regions[0]!.timelineOffset);
  const timelineEnd = Math.max(
    ...regions.map((region) => region.timelineOffset + region.duration),
  );
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(
    1,
    Math.ceil((timelineEnd - timelineOffset) * sampleRate),
    sampleRate,
  );
  const output = buffer.getChannelData(0);
  for (const region of regions) {
    const take = takes.find((entry) => entry.id === region.takeId);
    if (!take?.buffer) {
      continue;
    }
    const source = take.buffer.getChannelData(0);
    const outputStart = Math.round(
      (region.timelineOffset - timelineOffset) * sampleRate,
    );
    const outputLength = Math.round(region.duration * sampleRate);
    for (let index = 0; index < outputLength; index++) {
      const sourcePosition =
        (region.sourceOffset + index / sampleRate) * take.buffer.sampleRate;
      const sourceIndex = Math.floor(sourcePosition);
      const fraction = sourcePosition - sourceIndex;
      output[outputStart + index] =
        (source[sourceIndex] ?? 0) * (1 - fraction) +
        (source[sourceIndex + 1] ?? source[sourceIndex] ?? 0) * fraction;
    }
  }
  return buffer;
}
